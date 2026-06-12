import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../types/env';
import { resolveForWrite, resolveForRead, RepoMeta } from '../../../services/repoRouter';
import { sha256 } from '../../../utils/hash';
import { stripMetadata } from '../../../utils/imageProcessor';
import { githubService } from '../../../services/github';
import { logger } from '../../../utils/logger';
import { dbService } from '../../../services/database';

const uploadApi = new Hono<AppEnvironment>();

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB

uploadApi.post('/', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large (max 25MB)' }, 400);
    }

    const mimeType = file.type;
    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];
    if (!allowedMimes.includes(mimeType)) {
      return c.json({ error: 'Unsupported file type' }, 400);
    }

    let arrayBuffer = await file.arrayBuffer();
    
    // Strip metadata for privacy if it's a JPEG or PNG
    arrayBuffer = await stripMetadata(arrayBuffer, mimeType);

    const hash = await sha256(arrayBuffer);

    // Phase 3: D1 primary for deduplication
    if (c.env.DB) {
      try {
        const existing: any = await c.env.DB.prepare(`SELECT path, repo_id as repoId FROM paths WHERE hash = ?`).bind(hash).first();
        if (existing) {
          // Verify physical existence on GitHub
          const repoForOld = await resolveForRead(existing.path, c.env);
          const exists = await githubService.fileExists(existing.path, repoForOld);
          if (exists) {
            return c.json({ ...existing, sha256: hash, deduplicated: true });
          } else {
            // D1 entry is stale, physical file is gone. Delete D1 entry and proceed.
            await c.env.DB.prepare(`DELETE FROM paths WHERE hash = ?`).bind(hash).run();
          }
        }
      } catch (e) {
        console.error('D1 deduplication check failed:', e);
      }
    }

    // Fallback to KV for deduplication (transition phase)
    if (c.env.REPO_REGISTRY) {
      const existing = await c.env.REPO_REGISTRY.get(`hash::${hash}`, 'json');
      if (existing) {
        const meta = existing as any;
        const repoForOld = await resolveForRead(meta.path, c.env);
        const exists = await githubService.fileExists(meta.path, repoForOld);
        if (exists) {
          return c.json({ ...meta, deduplicated: true });
        } else {
          await c.env.REPO_REGISTRY.delete(`hash::${hash}`);
        }
      }
    }

    // Auto-apply pathPrefix from token if present
    const tokenInfo = c.get('tokenInfo') as any;
    let targetDir = typeof body['targetDir'] === 'string' ? body['targetDir'].replace(/^\/+|\/+$/g, '') : '';
    if (!targetDir && tokenInfo?.pathPrefix) {
      targetDir = tokenInfo.pathPrefix.replace(/^\/+|\/+$/g, '');
    }

    let ext = file.name.split('.').pop() || 'png';
    ext = ext.toLowerCase();

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const ts = Date.now().toString(36).slice(-6);
    const fileName = `${baseName}-${hash.slice(0, 4)}${ts}.${ext}`;
    const path = targetDir ? `${targetDir}/${fileName}` : fileName;

    const repo = await resolveForWrite(c.env, file.size);
    const base64Content = Buffer.from(arrayBuffer).toString('base64');
    
    const githubUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodeURIComponent(path)}`;
    const githubRes = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${repo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload ${path} via Admin UI`,
        content: base64Content,
        branch: repo.meta.branch
      })
    });

    if (!githubRes.ok) {
      const errText = await githubRes.text();
      return c.json({ error: 'GitHub upload failed', details: errText }, 500);
    }

    const result = {
      url: `/${path}`,
      path,
      repo: repo.meta.id,
      size: file.size,
      sha256: hash,
      uploadedAt: new Date().toISOString()
    };

    // Phase 3: D1 primary for recording addition
    if (c.env.DB) {
      await dbService.recordFileAddition(c.env.DB, path, repo.meta.id, file.size, hash);
    }

    // KV mirror disabled: D1-only mode for lower KV write costs

    const origin = new URL(c.req.url).origin;
    const fullUrl = `${origin}${result.url}`;

    const isApiRequest = !!c.req.header('Authorization');
    const responseData = { ...result, fullUrl, url: isApiRequest ? fullUrl : result.url, deduplicated: false };

    // Record Audit Log
    c.executionCtx.waitUntil(logger.recordAudit(c, 'UPLOAD_FILE', { 
      path: result.path, 
      size: result.size, 
      repoId: result.repo,
      isApi: isApiRequest
    }));

    return c.json(responseData);

  } catch (err: any) {
    logger.captureError(c, err, { event: 'upload_failed' });
    return c.json({ error: 'Internal upload error', message: err.message }, 500);
  }
});


export default uploadApi;
