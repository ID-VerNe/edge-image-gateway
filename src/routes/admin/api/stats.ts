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

export default statsApi;
