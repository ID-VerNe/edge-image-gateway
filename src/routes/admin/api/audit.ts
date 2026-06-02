import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';

const auditApi = new Hono<AppEnvironment>();

auditApi.get('/', async (c) => {
  const kv = c.env.REPO_REGISTRY;
  if (!kv) return c.json({ error: 'KV not configured' }, 400);

  // List all audit keys, sorted by timestamp descending
  // KV lists alphabetically, so audit::[timestamp] will be ascending.
  // We'll reverse it manually or use prefix listing.
  const list = await kv.list({ prefix: 'audit::' });
  const keys = list.keys.reverse(); // Newest first

  const logs = await Promise.all(
    keys.slice(0, 50).map(async (key) => {
      const data = await kv.get(key.name, 'json');
      return data;
    })
  );

  return c.json({ logs });
});

export default auditApi;
