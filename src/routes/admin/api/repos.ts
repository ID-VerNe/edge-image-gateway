import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { listAllRepos, RepoMeta, getCurrentWriteId, getTokenFromEnv } from '../../../services/repoRouter';
import { Buffer } from 'node:buffer';
import { githubService } from '../../../services/github';

const repoApi = new Hono<AppEnvironment>();

repoApi.get('/', async (c) => {
  const repos = await listAllRepos(c.env, true);
  const currentWriteId = await getCurrentWriteId(c.env, true);
  return c.json({ repos, currentWriteId });
});

repoApi.post('/route/write', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const { repo } = await c.req.json() as any;
  if (!repo) return c.json({ error: 'Repo ID is required' }, 400);

  // If repo is 'fallback', we just delete the override
  if (repo === 'fallback') {
    await c.env.REPO_REGISTRY.delete('route::current_write');
  } else {
    // Verify repo exists
    const exists = await c.env.REPO_REGISTRY.get(`repo::${repo}`);
    if (!exists) return c.json({ error: 'Repository not found' }, 404);
    await c.env.REPO_REGISTRY.put('route::current_write', repo);
  }

  return c.json({ success: true, currentWriteId: repo });
});

repoApi.post('/', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const body = await c.req.json() as any;
  const { id, owner, name, branch, capacityLimitBytes, tokenSecretName } = body;
  
  if (!id || !owner || !name) return c.json({ error: 'Missing required fields' }, 400);

  const token = getTokenFromEnv(c.env, tokenSecretName || 'GITHUB_TOKEN');
  
  // Use a temporary ResolvedRepo object for GitHubService
  const tempRepo = {
    meta: { owner, name, branch: branch || 'main' } as any,
    token
  };

  // 1. Check if physical repo exists
  const exists = await githubService.fileExists('', tempRepo);

  if (!exists) {
    // 2. Try to create the repo if missing
    const createRes = await githubService.createRepository(owner, name, token);

    if (!createRes.ok) {
      const err = await createRes.text();
      return c.json({ 
        error: `Repository "${owner}/${name}" not found and auto-creation failed.`, 
        details: err,
        suggestion: 'Please create the private repository manually on GitHub or check your Token permissions (needs "repo" scope).' 
      }, 400);
    }

    // 3. Initialize with .keep file to create the branch
    const initBranch = branch || 'main';
    await githubService.putFile(
      '.keep',
      tempRepo,
      Buffer.from('Storage initialized').toString('base64'),
      'Initial commit via Edge Image Gateway'
    );
  }

  // 4. Register in KV
  const existingId = await c.env.REPO_REGISTRY.get(`repo::${id}`);
  if (existingId) return c.json({ error: 'Repository ID already exists' }, 400);

  // Check for duplicate physical repository (owner/name)
  const allRepos = await listAllRepos(c.env, true);
  const isDuplicateRepo = allRepos.some(r => 
    r.owner.toLowerCase() === owner.toLowerCase() && 
    r.name.toLowerCase() === name.toLowerCase() &&
    r.id !== 'fallback'
  );
  if (isDuplicateRepo) {
    return c.json({ error: 'This physical repository is already registered with another ID' }, 400);
  }

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

repoApi.put('/:id', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const oldId = c.req.param('id');
  const body = await c.req.json() as any;
  const { newId, owner, name, branch, capacityLimitBytes, tokenSecretName, status } = body;

  const existingStr = await c.env.REPO_REGISTRY.get(`repo::${oldId}`);
  if (!existingStr) return c.json({ error: 'Repo not found' }, 404);
  const repo = JSON.parse(existingStr) as RepoMeta;

  // If ID changed, check if new ID exists
  if (newId && newId !== oldId) {
    const conflict = await c.env.REPO_REGISTRY.get(`repo::${newId}`);
    if (conflict) return c.json({ error: 'New Repository ID already exists' }, 400);
  }

  // Check physical repo uniqueness if owner/name changed
  if ((owner && owner !== repo.owner) || (name && name !== repo.name)) {
    const allRepos = await listAllRepos(c.env, true);
    const isDuplicateRepo = allRepos.some(r => 
      r.id !== oldId &&
      r.owner.toLowerCase() === (owner || repo.owner).toLowerCase() && 
      r.name.toLowerCase() === (name || repo.name).toLowerCase()
    );
    if (isDuplicateRepo) {
      return c.json({ error: 'This physical repository is already registered with another ID' }, 400);
    }
  }

  const updatedRepo: RepoMeta = {
    ...repo,
    id: newId || repo.id,
    owner: owner || repo.owner,
    name: name || repo.name,
    branch: branch || repo.branch,
    capacityLimitBytes: capacityLimitBytes || repo.capacityLimitBytes,
    tokenSecretName: tokenSecretName || repo.tokenSecretName,
    status: status || repo.status
  };

  if (newId && newId !== oldId) {
    await c.env.REPO_REGISTRY.delete(`repo::${oldId}`);
    // If it was the current write repo, update the route
    const currentWrite = await c.env.REPO_REGISTRY.get('route::current_write');
    if (currentWrite === oldId) {
      await c.env.REPO_REGISTRY.put('route::current_write', newId);
    }
  }
  
  await c.env.REPO_REGISTRY.put(`repo::${updatedRepo.id}`, JSON.stringify(updatedRepo));
  return c.json({ success: true, repo: updatedRepo });
});

repoApi.delete('/:id', async (c) => {
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  const id = c.req.param('id');
  const deleteAllLinked = c.req.query('all') === 'true';

  const existingStr = await c.env.REPO_REGISTRY.get(`repo::${id}`);
  if (!existingStr) return c.json({ error: 'Repo not found' }, 404);
  const targetRepo = JSON.parse(existingStr) as RepoMeta;

  if (deleteAllLinked) {
    const allRepos = await listAllRepos(c.env, true);
    for (const r of allRepos) {
      if (r.owner.toLowerCase() === targetRepo.owner.toLowerCase() && 
          r.name.toLowerCase() === targetRepo.name.toLowerCase()) {
        await c.env.REPO_REGISTRY.delete(`repo::${r.id}`);
      }
    }
  } else {
    await c.env.REPO_REGISTRY.delete(`repo::${id}`);
  }

  // Clean up write target if deleted
  const currentWrite = await c.env.REPO_REGISTRY.get('route::current_write');
  if (currentWrite === id || (deleteAllLinked && currentWrite)) {
     // Verify if currentWrite still exists
     const stillExists = await c.env.REPO_REGISTRY.get(`repo::${currentWrite}`);
     if (!stillExists) {
       await c.env.REPO_REGISTRY.delete('route::current_write');
     }
  }

  return c.json({ success: true });
});

export default repoApi;
