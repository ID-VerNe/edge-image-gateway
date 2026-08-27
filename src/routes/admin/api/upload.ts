import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../types/env';
import { resolveForWrite, resolveForRead, RepoMeta } from '../../../services/repoRouter';
import { sha256 } from '../../../utils/hash';
import { stripMetadata } from '../../../utils/imageProcessor';
import { githubService } from '../../../services/github';
import { logger } from '../../../utils/logger';
import { dbService } from '../../../services/database';
import { normalizePath } from '../../../utils/path';
import { checkPathPrefix } from '../../../middleware/adminAuth';

const uploadApi = new Hono<AppEnvironment>();

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tiff']);

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tiff: 'image/tiff'
};

const MAGIC_BYTES: { bytes: number[]; mime: string }[] = [
  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' },
  { bytes: [0x00, 0x00, 0x00], mime: 'image/avif' },
  { bytes: [0x3C], mime: 'image/svg+xml' },
  { bytes: [0x42, 0x4D], mime: 'image/bmp' },
  { bytes: [0x00, 0x00, 0x01, 0x00], mime: 'image/x-icon' },
  { bytes: [0x49, 0x49, 0x2A, 0x00], mime: 'image/tiff' },
  { bytes: [0x4D, 0x4D, 0x00, 0x2A], mime: 'image/tiff' },
];

const detectMimeFromBytes = (buffer: ArrayBuffer): string | null => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return null;

  if (bytes[0] === 0x3C) {
    const text = new TextDecoder('utf-8').decode(bytes.slice(0, 256)).toLowerCase().trim();
    if (text.startsWith('<?xml') || text.startsWith('<svg')) return 'image/svg+xml';
  }

  for (const sig of MAGIC_BYTES) {
    if (sig.bytes.length > bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (sig.mime === 'image/avif' && i > 3) break;
      if (bytes[i] !== sig.bytes[i]) { match = false; break; }
    }
    if (match && sig.mime !== 'image/svg+xml') return sig.mime;
  }

  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 && (bytes[8] === 0x61 || bytes[8] === 0x6D)) {
    return 'image/avif';
  }

  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }

  return null;
};

uploadApi.post('/', async (c) => {
  try {
    const contentLength = c.req.header('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large (max 25MB)' }, 413);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({ error: 'File too large (max 25MB)' }, 400);
    }

    let ext = (file.name.split('.').pop() || 'png').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return c.json({ error: 'Unsupported file extension. Allowed: ' + Array.from(ALLOWED_EXTENSIONS).join(', ') }, 400);
    }

    const expectedMime = EXT_TO_MIME[ext];
    const clientMime = file.type;

    let arrayBuffer = await file.arrayBuffer();

    const detectedMime = detectMimeFromBytes(arrayBuffer);
    if (detectedMime) {
      if (detectedMime !== expectedMime && !(detectedMime === 'image/jpeg' && expectedMime === 'image/jpeg')) {
        if (ext === 'jpg' || ext === 'jpeg') {
          if (detectedMime !== 'image/jpeg') return c.json({ error: 'File content does not match extension' }, 400);
        } else if (detectedMime !== expectedMime) {
          return c.json({ error: 'File content does not match extension' }, 400);
        }
      }
    }

    if (clientMime && clientMime !== expectedMime && clientMime !== 'application/octet-stream') {
      if (ext !== 'jpg' && ext !== 'jpeg') {
        if (clientMime !== expectedMime) return c.json({ error: 'Unsupported file type' }, 400);
      }
    }

    arrayBuffer = await stripMetadata(arrayBuffer, expectedMime);

    const hash = await sha256(arrayBuffer);

    const dedupePolicy = body['dedupe'] as string || 'reuse';

    if (dedupePolicy === 'reuse' && c.env.DB) {
      try {
        const existing: any = await c.env.DB.prepare(`SELECT path, repo_id as repoId FROM paths WHERE hash = ?`).bind(hash).first();
        if (existing) {
          const repoForOld = await resolveForRead(existing.path, c.env);
          const exists = await githubService.fileExists(existing.path, repoForOld);
          if (exists) {
            const isApiRequest = !!c.req.header('Authorization');
            const dedupeOrigin = c.env.APP_URL || new URL(c.req.url).origin;
            const dedupeFullUrl = `${dedupeOrigin}/${existing.path}`;
            return c.json({
              ...existing,
              url: isApiRequest ? dedupeFullUrl : '/' + existing.path,
              fullUrl: dedupeFullUrl,
              sha256: hash,
              deduplicated: true
            });
          } else {
            await c.env.DB.prepare(`DELETE FROM paths WHERE hash = ?`).bind(hash).run();
          }
        }
      } catch (e) {
        console.error('D1 deduplication check failed:', e);
      }
    }

    const tokenInfo = c.get('tokenInfo') as any;
    let targetDir = typeof body['targetDir'] === 'string' ? body['targetDir'].replace(/^\/+|\/+$/g, '') : '';
    if (tokenInfo?.pathPrefix) {
      const normPrefix = tokenInfo.pathPrefix.replace(/^\/+|\/+$/g, '');
      if (!targetDir) {
        targetDir = normPrefix;
      } else if (!targetDir.startsWith(normPrefix)) {
        return c.json({ error: 'Token is restricted to path prefix: ' + tokenInfo.pathPrefix }, 403);
      }
    }

    const prefixCheck = checkPathPrefix(tokenInfo, targetDir || '/');
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 50);
    const ts = Date.now().toString(36).slice(-6);
    const fileName = `${baseName}-${hash.slice(0, 4)}${ts}.${ext}`;
    const path = targetDir ? `${targetDir}/${fileName}` : fileName;

    const normalized = normalizePath('/' + path);
    if (!normalized) {
      return c.json({ error: 'Invalid path or path traversal detected' }, 400);
    }

    const repo = await resolveForWrite(c.env, file.size);
    const base64Content = Buffer.from(arrayBuffer).toString('base64');
    
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const githubUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}`;
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
      return c.json({ error: 'Upload failed' }, 500);
    }

    const result = {
      url: `/${path}`,
      path,
      repo: repo.meta.id,
      size: file.size,
      sha256: hash,
      uploadedAt: new Date().toISOString()
    };

    if (c.env.DB) {
      await dbService.recordFileAddition(c.env.DB, path, repo.meta.id, file.size, hash);
    }

    const origin = c.env.APP_URL || new URL(c.req.url).origin;
    const fullUrl = `${origin}${result.url}`;

    const isApiRequest = !!c.req.header('Authorization');
    const responseData = { ...result, fullUrl, url: isApiRequest ? fullUrl : result.url, deduplicated: false };

    c.executionCtx.waitUntil(logger.recordAudit(c, 'UPLOAD_FILE', { 
      path: result.path, 
      size: result.size, 
      repoId: result.repo,
      isApi: isApiRequest
    }));

    return c.json(responseData);

  } catch (err: any) {
    logger.captureError(c, err, { event: 'upload_failed' });
    return c.json({ error: 'Upload failed' }, 500);
  }
});


export default uploadApi;
