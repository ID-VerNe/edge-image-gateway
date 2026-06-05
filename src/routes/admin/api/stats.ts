import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { listAllRepos } from '../../../services/repoRouter';
import { dbService } from '../../../services/database';
import { logger } from '../../../utils/logger';

const statsApi = new Hono<AppEnvironment>();

statsApi.get('/', async (c) => {
  const repos = await listAllRepos(c.env);
  let totalSize = 0;
  let totalFiles = 0;
  repos.forEach(r => {
    totalSize += r.sizeBytes || 0;
    totalFiles += r.fileCount || 0;
  });

  return c.json({
    repoCount: repos.length,
    totalSizeBytes: totalSize,
    totalFiles: totalFiles,
    repos: repos.map(r => ({
      id: r.id,
      usagePercent: Math.round(((r.sizeBytes || 0) / (r.capacityLimitBytes || 1)) * 100)
    }))
  });
});

statsApi.post('/cache/purge', async (c) => {
  return c.json({ success: true, message: 'Cache purge request received (Note: Workers Cache API is colocation-specific)' });
});

statsApi.get('/tokens', async (c) => {
  // Phase 3: D1 primary
  if (c.env.DB) {
    try {
      const { results } = await c.env.DB.prepare(`SELECT token as id, name, permissions, path_prefix as pathPrefix, created_at as createdAt, expires_at as expiresAt, last_used_at as lastUsedAt FROM auth_tokens ORDER BY created_at DESC`).all();
      if (results.length > 0) {
         return c.json(results.map((r: any) => ({
           ...r,
           permissions: r.permissions ? JSON.parse(r.permissions) : ['read', 'write', 'delete']
         })));
      }
    } catch (e) {
      console.error('D1 token list failed:', e);
    }
  }

  // Fallback to KV
  if (!c.env.REPO_REGISTRY) return c.json([]);
  const { keys } = await c.env.REPO_REGISTRY.list({ prefix: 'auth::token::' });
  const tokens = [];
  for (const key of keys) {
    const val = await c.env.REPO_REGISTRY.get(key.name, 'json') as any;
    tokens.push({
      id: key.name.replace('auth::token::', ''),
      name: val.name,
      createdAt: val.createdAt,
      permissions: val.permissions || ['read', 'write', 'delete'],
      pathPrefix: val.pathPrefix,
      expiresAt: val.expiresAt,
      lastUsedAt: val.lastUsedAt
    });
  }
  return c.json(tokens);
});

statsApi.post('/tokens', async (c) => {
  const { name, scopes, pathPrefix, expiresInDays } = await c.req.json() as any;
  if (!name) return c.json({ error: 'Token name is required' }, 400);

  const token = `gt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  
  let expiresAtStr: string | undefined;
  if (expiresInDays) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + parseInt(expiresInDays, 10));
    expiresAtStr = expDate.toISOString();
  }

  const permissions = Array.isArray(scopes) ? scopes : ['read', 'write', 'delete'];
  
  // Phase 3: D1 primary
  if (c.env.DB) {
    await dbService.upsertToken(c.env.DB, token, name, now, permissions, pathPrefix, expiresAtStr);
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil(c.env.REPO_REGISTRY.put(`auth::token::${token}`, JSON.stringify({ 
      name, 
      createdAt: now,
      permissions,
      pathPrefix,
      expiresAt: expiresAtStr
    })));
  }

  return c.json({ success: true, token, name, permissions, pathPrefix, expiresAt: expiresAtStr });
});

statsApi.delete('/tokens/:id', async (c) => {
  const id = c.req.param('id');
  
  // Phase 3: D1 primary
  if (c.env.DB) {
    await c.env.DB.prepare('DELETE FROM auth_tokens WHERE token = ?').bind(id).run();
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil(c.env.REPO_REGISTRY.delete(`auth::token::${id}`));
  }

  return c.json({ success: true });
});

export default statsApi;
