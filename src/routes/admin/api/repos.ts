import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { listAllRepos, RepoMeta } from '../../../services/repoRouter';

const repoApi = new Hono<AppEnvironment>();

repoApi.get('/', async (c) => {
  const repos = await listAllRepos(c.env);
  return c.json({ repos });
});

repoApi.post('/', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const body = await c.req.json() as any;
  const { id, owner, name, branch, capacityLimitBytes, tokenSecretName } = body;
  
  if (!id || !owner || !name) return c.json({ error: 'Missing required fields' }, 400);

  const newRepo: RepoMeta = {
    id, owner, name, 
    branch: branch || 'main',
    status: 'active',
    createdAt: new Date().toISOString(),
    sizeBytes: 0,
    fileCount: 0,
    capacityLimitBytes: capacityLimitBytes || (5 * 1024 * 1024 * 1024), // 5GB
    tokenSecretName: tokenSecretName || 'GITHUB_TOKEN'
  };

  await c.env.REPO_REGISTRY.put(`repo::${id}`, JSON.stringify(newRepo));
  return c.json({ success: true, repo: newRepo });
});

repoApi.patch('/:id', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const id = c.req.param('id');
  const body = await c.req.json() as any;
  
  const existingStr = await c.env.REPO_REGISTRY.get(`repo::${id}`);
  if (!existingStr) return c.json({ error: 'Repo not found' }, 404);
  
  const repo = JSON.parse(existingStr) as RepoMeta;
  if (body.status) repo.status = body.status;
  
  await c.env.REPO_REGISTRY.put(`repo::${id}`, JSON.stringify(repo));
  return c.json({ success: true, repo });
});

repoApi.post('/route/write', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const body = await c.req.json() as any;
  const repoId = body.repo;
  if (!repoId) return c.json({ error: 'Missing repo ID' }, 400);

  await c.env.REPO_REGISTRY.put('route::current_write', repoId);
  return c.json({ success: true, current_write: repoId });
});

export default repoApi;
