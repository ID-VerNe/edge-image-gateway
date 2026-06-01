import { Bindings } from '../types/env';
import { listAllRepos } from './repoRouter';

export const syncCapacity = async (env: Bindings) => {
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
      results.push({ id: repo.id, actualSizeBytes, updated: true });
    } else {
      results.push({ id: repo.id, error: 'Failed to fetch from GitHub' });
    }
  }

  return results;
};