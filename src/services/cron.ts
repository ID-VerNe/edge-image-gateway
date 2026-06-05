import { Bindings } from '../types/env';
import { listAllRepos } from './repoRouter';
import { alertThrottled } from '../utils/notifications';
import { RepoMigrationJob, migrateRepo } from './repoMigration';

export const syncCapacity = async (env: Bindings, ctx?: any) => {
  if (!env.REPO_REGISTRY) throw new Error('KV not configured');

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
      // GitHub API returns size in KB
      const actualSizeBytes = (data.size || 0) * 1024;

      if (repo.sizeBytes !== actualSizeBytes) {
        repo.sizeBytes = actualSizeBytes;
        await env.REPO_REGISTRY.put(`repo::${repo.id}`, JSON.stringify(repo));
      }

      // Check threshold (85%)
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

  // Auto-resume paused migration jobs
  try {
    const { keys } = await env.REPO_REGISTRY.list({ prefix: 'repo_migration::' });
    for (const key of keys) {
      const raw = await env.REPO_REGISTRY.get(key.name);
      if (raw) {
        const job = JSON.parse(raw) as RepoMigrationJob;
        if (job.status === 'paused') {
          job.status = 'running';
          await env.REPO_REGISTRY.put(key.name, JSON.stringify(job));
          if (ctx && ctx.waitUntil) {
            ctx.waitUntil(migrateRepo(job, env));
          } else {
            migrateRepo(job, env).catch(console.error);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to auto-resume migrations', err);
  }

  return results;
};
