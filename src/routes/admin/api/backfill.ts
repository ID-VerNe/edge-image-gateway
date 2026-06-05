import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { dbService } from '../../../services/database';
import { RepoMeta } from '../../../services/repoRouter';

const backfillApi = new Hono<AppEnvironment>();

backfillApi.post('/start', async (c) => {
  const kv = c.env.REPO_REGISTRY;
  const db = c.env.DB;

  if (!kv || !db) {
    return c.json({ error: 'KV or DB not configured' }, 400);
  }

  const results = {
    repos: 0,
    paths: 0,
    tokens: 0,
    errors: [] as string[]
  };

  try {
    // 1. Backfill Repos
    const repoKeys = await kv.list({ prefix: 'repo::' });
    for (const key of repoKeys.keys) {
      try {
        const repo = await kv.get(key.name, 'json') as RepoMeta;
        if (repo) {
          await dbService.upsertRepo(db, repo);
          results.repos++;
        }
      } catch (e: any) {
        results.errors.push(`Repo backfill failed (${key.name}): ${e.message}`);
      }
    }

    // 2. Backfill Paths
    const pathKeys = await kv.list({ prefix: 'path::' });
    for (const key of pathKeys.keys) {
      try {
        const path = key.name.replace('path::', '');
        const val = await kv.get(key.name, 'json') as any;
        let repoId = '';
        let hash = '';
        
        if (typeof val === 'string') {
          repoId = val;
        } else if (val && typeof val === 'object') {
          repoId = val.repoId;
          hash = val.hash;
        }

        if (repoId) {
          // Use INSERT OR IGNORE / UPSERT
          await db.prepare(`
            INSERT INTO paths (path, repo_id, hash)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
              repo_id = excluded.repo_id,
              hash = excluded.hash
          `).bind(path, repoId, hash || null).run();
          results.paths++;
        }
      } catch (e: any) {
        results.errors.push(`Path backfill failed (${key.name}): ${e.message}`);
      }
    }

    // 3. Backfill Tokens
    const tokenKeys = await kv.list({ prefix: 'auth::token::' });
    for (const key of tokenKeys.keys) {
      try {
        const token = key.name.replace('auth::token::', '');
        const val = await kv.get(key.name, 'json') as any;
        if (val) {
          await dbService.upsertToken(db, token, val.name, val.createdAt || new Date().toISOString());
          results.tokens++;
        }
      } catch (e: any) {
        results.errors.push(`Token backfill failed (${key.name}): ${e.message}`);
      }
    }

    // 4. Backfill System Config
    const currentWrite = await kv.get('route::current_write');
    if (currentWrite) {
      await dbService.setConfig(db, 'route::current_write', currentWrite);
    }

    return c.json({ success: true, results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, results }, 500);
  }
});

export default backfillApi;
