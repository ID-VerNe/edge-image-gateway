import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { dbService } from '../../../services/database';

const auditApi = new Hono<AppEnvironment>();

auditApi.get('/', async (c) => {
  // Read audit logs from D1 (primary), not KV
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const logs = await dbService.getAuditLogs(c.env.DB, 50);
    return c.json({ logs });
  } catch (err: any) {
    return c.json({ error: 'Failed to query audit logs', message: err.message }, 500);
  }
});

export default auditApi;
