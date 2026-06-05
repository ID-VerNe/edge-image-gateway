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
      const { results } = await c.env.DB.prepare(`SELECT token as id, name, created_at as createdAt FROM auth_tokens ORDER BY created_at DESC`).all();
      if (results.length > 0) return c.json(results);
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
      createdAt: val.createdAt
    });
  }
  return c.json(tokens);
});

statsApi.post('/tokens', async (c) => {
  const { name } = await c.req.json() as any;
  if (!name) return c.json({ error: 'Token name is required' }, 400);

  const token = `gt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  
  // Phase 3: D1 primary
  if (c.env.DB) {
    await dbService.upsertToken(c.env.DB, token, name, now);
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil(c.env.REPO_REGISTRY.put(`auth::token::${token}`, JSON.stringify({ name, createdAt: now })));
  }

  return c.json({ success: true, token, name });
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
