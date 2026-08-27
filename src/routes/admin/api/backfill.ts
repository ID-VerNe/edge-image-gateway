import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { dbService } from '../../../services/database';
import { RepoMeta } from '../../../services/repoRouter';

const backfillApi = new Hono<AppEnvironment>();

backfillApi.post('/start', async (c) => {
  return c.json({ success: false, error: 'KV backfill is no longer available. All data is D1-only.' }, 400);
});

export default backfillApi;
