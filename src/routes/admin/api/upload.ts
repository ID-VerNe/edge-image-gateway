import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../types/env';
import { resolveForWrite } from '../../../services/repoRouter';
import { sha256 } from '../../../utils/hash';

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

    const arrayBuffer = await file.arrayBuffer();
    const hash = await sha256(arrayBuffer);

    if (c.env.REPO_REGISTRY) {
      const existing = await c.env.REPO_REGISTRY.get(`hash::${hash}`, 'json');
      if (existing) {
        return c.json({ ...existing as object, deduplicated: true });
      }
    }

    const targetDir = typeof body['targetDir'] === 'string' ? body['targetDir'].replace(/^\/+|\/+$/g, '') : '';
    let ext = file.name.split('.').pop() || 'png';
    ext = ext.toLowerCase();
    
    let path = '';
    if (targetDir) {
      let baseName = file.name.replace(/\.[^/.]+$/, "");
      path = `${targetDir}/${baseName}-${hash.slice(0, 6)}.${ext}`;
    } else {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      path = `${yyyy}/${mm}/${hash.slice(0, 12)}.${ext}`;
    }

    const repo = await resolveForWrite(c.env);
    const base64Content = Buffer.from(arrayBuffer).toString('base64');
    
    const githubUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}`;
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

    if (c.env.REPO_REGISTRY) {
      await c.env.REPO_REGISTRY.put(`hash::${hash}`, JSON.stringify(result));
      await c.env.REPO_REGISTRY.put(`path::${path}`, repo.meta.id);
      repo.meta.sizeBytes += file.size;
      repo.meta.fileCount += 1;
      await c.env.REPO_REGISTRY.put(`repo::${repo.meta.id}`, JSON.stringify(repo.meta));
    }

    const origin = new URL(c.req.url).origin;
    const fullUrl = `${origin}${result.url}`;

    return c.json({ ...result, fullUrl, deduplicated: false });

  } catch (err: any) {
    return c.json({ error: 'Internal upload error', message: err.message }, 500);
  }
});

export default uploadApi;
