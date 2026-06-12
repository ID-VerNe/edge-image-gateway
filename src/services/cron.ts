import { Bindings } from '../types/env';
import { listAllRepos } from './repoRouter';
import { alertThrottled } from '../utils/notifications';
import { RepoMigrationJob, migrateRepo } from './repoMigration';
import { dbService } from './database';

export const syncCapacity = async (env: Bindings, ctx?: any) => {
  const repos = await listAllRepos(env);
  const results = [];

  for (const repo of repos) {
    if (repo.id === 'fallback') continue;

    const token = (env as any)[repo.tokenSecretName] || env.GITHUB_TOKEN;
    const url = `https://api.github.com/repos/${repo.owner}/${repo.name}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy'
      }
    });

    if (res.ok) {
      const data: any = await res.json();
      const actualSizeBytes = (data.size || 0) * 1024;

      if (repo.sizeBytes !== actualSizeBytes && env.DB) {
        repo.sizeBytes = actualSizeBytes;
        await dbService.upsertRepo(env.DB, repo);
      }

      const usage = actualSizeBytes / repo.capacityLimitBytes;
      if (usage > 0.85) {
        const percent = Math.round(usage * 100);
        await alertThrottled(`cap_${repo.id}`,
          `⚠️ <b>Capacity Warning</b>\nRepo: <code>${repo.id}</code>\nUsage: <b>${percent}%</b> (${(actualSizeBytes/1024/1024).toFixed(1)}MB / ${(repo.capacityLimitBytes/1024/1024/1024).toFixed(0)}GB)\nAction: Please add a new storage repo or clean up.`,
          env, 6, ctx
        );
      }

      results.push({ id: repo.id, actualSizeBytes, updated: true });
    } else {
      results.push({ id: repo.id, error: 'Failed to fetch from GitHub' });
    }
  }

  // Migration auto-resume moved to D1-based tracking
  if (env.DB) {
    try {
      const { results: tasks } = await env.DB.prepare(`SELECT * FROM migration_tasks WHERE status = 'paused'`).all();
      for (const task of tasks) {
        const job: RepoMigrationJob = {
          jobId: task.id as string,
          sourceRepo: task.source_repo_id as string,
          targetRepo: task.target_repo_id as string,
          status: 'running',
          cursor: null,
          total: 0,
          migrated: 0,
          failed: 0,
          errors: [],
          startedAt: Date.now(),
          updatedAt: Date.now()
        };
        await dbService.upsertTask(env.DB, { ...job, status: 'running', lastUpdate: Date.now() });
        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(migrateRepo(job, env));
        }
      }
    } catch (err) {
      console.error('Failed to auto-resume migrations', err);
    }
  }

  return results;
};
