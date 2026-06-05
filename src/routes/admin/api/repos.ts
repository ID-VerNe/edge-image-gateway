import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { listAllRepos, RepoMeta, getCurrentWriteId, getTokenFromEnv, getRepoById, invalidateRepoCache } from '../../../services/repoRouter';
import { Buffer } from 'node:buffer';
import { githubService } from '../../../services/github';
import { logger } from '../../../utils/logger';
import { dbService } from '../../../services/database';

const repoApi = new Hono<AppEnvironment>();

repoApi.get('/', async (c) => {
  const repos = await listAllRepos(c.env, true);
  const currentWriteId = await getCurrentWriteId(c.env, true);
  return c.json({ repos, currentWriteId });
});

repoApi.post('/route/write', async (c) => {
  const { repo } = await c.req.json() as any;
  if (!repo) return c.json({ error: 'Repo ID is required' }, 400);

  // Phase 3: D1 primary
  if (c.env.DB) {
    await dbService.setConfig(c.env.DB, 'route::current_write', repo);
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil((async () => {
      try {
        if (repo === 'fallback') {
          await c.env.REPO_REGISTRY!.delete('route::current_write');
        } else {
          await c.env.REPO_REGISTRY!.put('route::current_write', repo);
        }
      } catch (e) {
        logger.warn('kv_mirror_failed', { key: 'route::current_write', error: String(e) });
      }
    })());
  }

  invalidateRepoCache();
  c.executionCtx.waitUntil(logger.recordAudit(c, 'SWITCH_WRITE_REPO', { target: repo }));
  const repos = await listAllRepos(c.env, true);
  return c.json({ success: true, currentWriteId: repo, repos });
});

repoApi.post('/', async (c) => {
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

  // 4. Register in D1 (Phase 3 primary)
  const allRepos = await listAllRepos(c.env, true);
  const existsInRegistry = allRepos.some(r => r.id === id);
  if (existsInRegistry) return c.json({ error: 'Repository ID already exists' }, 400);

  // Check for duplicate physical repository (owner/name)
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

  if (c.env.DB) {
    await dbService.upsertRepo(c.env.DB, newRepo);
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil((async () => {
      try {
        await c.env.REPO_REGISTRY!.put(`repo::${id}`, JSON.stringify(newRepo));
      } catch (e) {
        logger.warn('kv_mirror_failed', { key: `repo::${id}`, error: String(e) });
      }
    })());
  }

  c.executionCtx.waitUntil(logger.recordAudit(c, 'CREATE_REPO', { id, owner, name }));
  
  invalidateRepoCache();
  const updatedRepos = await listAllRepos(c.env, true);
  return c.json({ success: true, repo: newRepo, repos: updatedRepos });
});

repoApi.put('/:id', async (c) => {
  const oldId = c.req.param('id');
  const body = await c.req.json() as any;
  const { newId, owner, name, branch, capacityLimitBytes, tokenSecretName, status } = body;

  const allRepos = await listAllRepos(c.env, true);
  const repo = allRepos.find(r => r.id === oldId);
  if (!repo) return c.json({ error: 'Repo not found' }, 404);

  // If ID changed, check if new ID exists
  if (newId && newId !== oldId) {
    const conflict = allRepos.find(r => r.id === newId);
    if (conflict) return c.json({ error: 'New Repository ID already exists' }, 400);
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

  // Phase 3: D1 primary
  if (c.env.DB) {
    if (newId && newId !== oldId) {
      await c.env.DB.prepare('DELETE FROM repos WHERE id = ?').bind(oldId).run();
      const currentWrite = await getCurrentWriteId(c.env);
      if (currentWrite === oldId) {
        await dbService.setConfig(c.env.DB, 'route::current_write', newId);
      }
    }
    await dbService.upsertRepo(c.env.DB, updatedRepo);
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil((async () => {
      try {
        if (newId && newId !== oldId) {
          await c.env.REPO_REGISTRY!.delete(`repo::${oldId}`);
          const currentWrite = await c.env.REPO_REGISTRY!.get('route::current_write');
          if (currentWrite === oldId) {
            await c.env.REPO_REGISTRY!.put('route::current_write', newId);
          }
        }
        await c.env.REPO_REGISTRY!.put(`repo::${updatedRepo.id}`, JSON.stringify(updatedRepo));
      } catch (e) {
        logger.warn('kv_mirror_failed', { key: `repo::${updatedRepo.id}`, error: String(e) });
      }
    })());
  }

  c.executionCtx.waitUntil(logger.recordAudit(c, 'UPDATE_REPO', { id: oldId, ...body }));
  
  invalidateRepoCache();
  const updatedRepos = await listAllRepos(c.env, true);
  return c.json({ success: true, repo: updatedRepo, repos: updatedRepos });
});

repoApi.post('/:id/sync', async (c) => {
  const id = c.req.param('id');
  const repo = await getRepoById(id, c.env);
  if (!repo) return c.json({ error: 'Repository not found' }, 404);

  try {
    const treeData = await githubService.getTree(repo, true);
    if (!treeData || !treeData.tree) return c.json({ error: 'GitHub API returned invalid data' }, 500);

    const blobs = treeData.tree.filter((item: any) => item.type === 'blob');
    let totalSize = 0;
    for (const item of blobs) {
      totalSize += item.size || 0;
    }

    repo.meta.fileCount = blobs.length;
    repo.meta.sizeBytes = totalSize;
    repo.meta.status = 'active'; 

    // Phase 3: D1 primary
    if (c.env.DB) {
      await dbService.upsertRepo(c.env.DB, repo.meta);
    }

    // Dual-write to KV (Background)
    if (c.env.REPO_REGISTRY) {
      c.executionCtx.waitUntil((async () => {
        try {
          await c.env.REPO_REGISTRY!.put(`repo::${id}`, JSON.stringify(repo.meta));
        } catch (e) {
          logger.warn('kv_mirror_failed', { key: `repo::${id}`, error: String(e) });
        }
      })());
    }

    c.executionCtx.waitUntil(logger.recordAudit(c, 'SYNC_REPO', { id, fileCount: blobs.length, sizeBytes: totalSize }));

    invalidateRepoCache();
    const repos = await listAllRepos(c.env, true);
    return c.json({ success: true, fileCount: blobs.length, sizeBytes: totalSize, repos });
  } catch (err: any) {
    return c.json({ error: 'Sync failed', message: err.message }, 500);
  }
});

repoApi.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const allRepos = await listAllRepos(c.env, true);
  const exists = allRepos.some(r => r.id === id);
  if (!exists) return c.json({ error: 'Repo not found' }, 404);

  // Phase 3: D1 primary
  if (c.env.DB) {
    await c.env.DB.prepare('DELETE FROM repos WHERE id = ?').bind(id).run();
    const currentWrite = await getCurrentWriteId(c.env);
    if (currentWrite === id) {
      await dbService.setConfig(c.env.DB, 'route::current_write', 'fallback');
    }
  }

  // Dual-write to KV (Background)
  if (c.env.REPO_REGISTRY) {
    c.executionCtx.waitUntil((async () => {
      try {
        await c.env.REPO_REGISTRY!.delete(`repo::${id}`);
        const currentWrite = await c.env.REPO_REGISTRY!.get('route::current_write');
        if (currentWrite === id) {
          await c.env.REPO_REGISTRY!.delete('route::current_write');
        }
      } catch (e) {
        logger.warn('kv_mirror_failed', { key: `repo::${id}`, error: String(e) });
      }
    })());
  }

  c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_REPO', { id }));

  invalidateRepoCache();
  const updatedRepos = await listAllRepos(c.env, true);
  return c.json({ success: true, repos: updatedRepos });
});

import { RepoMigrationJob, migrateRepo, saveJob } from '../../../services/repoMigration';

repoApi.post('/:id/migrate', async (c) => {
  const sourceRepo = c.req.param('id');
  const body = await c.req.json() as any;
  const { targetRepo } = body;

  if (!targetRepo) return c.json({ error: 'targetRepo is required' }, 400);

  const jobId = `mig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: RepoMigrationJob = {
    jobId,
    sourceRepo,
    targetRepo,
    status: 'running',
    cursor: null,
    total: 0,
    migrated: 0,
    failed: 0,
    errors: [],
    startedAt: Date.now(),
    updatedAt: Date.now()
  };

  await saveJob(job, c.env);

  // Set source repo to draining
  const sRepo = await getRepoById(sourceRepo, c.env);
  if (sRepo) {
    sRepo.meta.status = 'draining';
    if (c.env.DB) {
       await dbService.upsertRepo(c.env.DB, sRepo.meta);
    }
    if (c.env.REPO_REGISTRY) {
       await c.env.REPO_REGISTRY.put(`repo::${sourceRepo}`, JSON.stringify(sRepo.meta));
    }
  }

  // Start migration async
  c.executionCtx.waitUntil(migrateRepo(job, c.env));

  return c.json({ success: true, jobId });
});

repoApi.get('/migrations/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  
  const raw = await c.env.REPO_REGISTRY.get(`repo_migration::${jobId}`);
  if (!raw) return c.json({ error: 'Migration job not found' }, 404);
  
  return c.json(JSON.parse(raw));
});

repoApi.post('/migrations/:jobId/resume', async (c) => {
  const jobId = c.req.param('jobId');
  if (!c.env.REPO_REGISTRY) return c.json({ error: 'KV not configured' }, 400);
  
  const raw = await c.env.REPO_REGISTRY.get(`repo_migration::${jobId}`);
  if (!raw) return c.json({ error: 'Migration job not found' }, 404);
  
  const job: RepoMigrationJob = JSON.parse(raw);
  if (job.status !== 'paused' && job.status !== 'failed') {
    return c.json({ error: `Cannot resume job in status ${job.status}` }, 400);
  }

  job.status = 'running';
  await saveJob(job, c.env);

  c.executionCtx.waitUntil(migrateRepo(job, c.env));
  
  return c.json({ success: true, status: 'running' });
});

export default repoApi;
