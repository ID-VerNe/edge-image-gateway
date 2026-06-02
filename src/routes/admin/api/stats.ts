import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { listAllRepos } from '../../../services/repoRouter';

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
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const { name } = await c.req.json() as any;
  if (!name) return c.json({ error: 'Token name is required' }, 400);

  const token = `gt_\${Math.random().toString(36).slice(2)}\${Math.random().toString(36).slice(2)}`;
  const tokenData = {
    name,
    createdAt: new Date().toISOString()
  };

  await c.env.REPO_REGISTRY.put(`auth::token::\${token}`, JSON.stringify(tokenData));
  return c.json({ success: true, token, name });
});

statsApi.delete('/tokens/:id', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const id = c.req.param('id');
  await c.env.REPO_REGISTRY.delete(`auth::token::\${id}`);
  return c.json({ success: true });
});

export default statsApi;
