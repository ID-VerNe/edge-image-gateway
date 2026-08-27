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

const isAdminUser = (c: any): boolean => {
  const user = c.get('user');
  return user && !user.email.startsWith('token:');
};

statsApi.get('/tokens', async (c) => {
  if (!isAdminUser(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  if (c.env.DB) {
    try {
      const { results } = await c.env.DB.prepare(`SELECT token as id, name, permissions, path_prefix as pathPrefix, created_at as createdAt, expires_at as expiresAt, last_used_at as lastUsedAt FROM auth_tokens ORDER BY created_at DESC`).all();
      if (results.length > 0) {
         return c.json(results.map((r: any) => ({
           ...r,
           id: r.id ? `${r.id.substring(0, 8)}****` : '',
           permissions: r.permissions ? JSON.parse(r.permissions) : ['read', 'write', 'delete']
         })));
      }
    } catch (e) {
      console.error('D1 token list failed:', e);
    }
  }

  return c.json([]);
});

statsApi.post('/tokens', async (c) => {
  if (!isAdminUser(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { name, scopes, pathPrefix, expiresInDays } = await c.req.json() as any;
  if (!name) return c.json({ error: 'Token name is required' }, 400);

  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const tokenHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const token = `gt_${tokenHex}`;
  const now = new Date().toISOString();
  
  let expiresAtStr: string | undefined;
  if (expiresInDays) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + parseInt(expiresInDays, 10));
    expiresAtStr = expDate.toISOString();
  }

  const permissions = Array.isArray(scopes) ? scopes : ['read', 'write', 'delete'];
  
  if (c.env.DB) {
    await dbService.upsertToken(c.env.DB, token, name, now, permissions, pathPrefix, expiresAtStr);
  }

  return c.json({ success: true, token, name, permissions, pathPrefix, expiresAt: expiresAtStr });
});

statsApi.delete('/tokens/:id', async (c) => {
  if (!isAdminUser(c)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const id = c.req.param('id');

  if (c.env.DB) {
    await c.env.DB.prepare('DELETE FROM auth_tokens WHERE token = ?').bind(id).run();
  }

  return c.json({ success: true });
});

export default statsApi;
