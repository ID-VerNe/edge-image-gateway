import { Hono } from 'hono';
import { AppEnvironment } from '../../../../types/env';
import { resolveForRead } from '../../../../services/repoRouter';
import { githubService } from '../../../../services/github';

const queryApi = new Hono<AppEnvironment>();

queryApi.get('/', async (c) => {
  try {
    const prefix = (c.req.query('prefix') || '').replace(/^\/+|\/+$/g, '');
    const repo = await resolveForRead(prefix, c.env);
    
    const data = await githubService.getFile(prefix, repo);
    if (!data) return c.json({ files: [] });
    
    return c.json({ files: Array.isArray(data) ? data : [data] });
  } catch (err: any) {
    return c.json({ error: 'Internal list error', message: err.message }, 500);
  }
});

export default queryApi;
