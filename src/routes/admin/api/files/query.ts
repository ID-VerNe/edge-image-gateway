import { Hono } from 'hono';
import { AppEnvironment } from '../../../../types/env';
import { resolveForRead } from '../../../../services/repoRouter';
import { githubService } from '../../../../services/github';
import { checkPathPrefix } from '../../../../middleware/adminAuth';

const queryApi = new Hono<AppEnvironment>();

queryApi.get('/', async (c) => {
  try {
    const prefix = (c.req.query('prefix') || '').replace(/^\/+|\/+$/g, '');
    
    const tokenInfo = c.get('tokenInfo' as any);
    const prefixCheck = checkPathPrefix(tokenInfo, '/' + prefix);
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);
    
    const repo = await resolveForRead(prefix, c.env);
    
    const data = await githubService.getFile(prefix, repo);
    if (!data) return c.json({ files: [] });
    
    const files = Array.isArray(data) ? data : [data];
    const filtered = tokenInfo?.pathPrefix
      ? files.filter((f: any) => {
          const check = checkPathPrefix(tokenInfo, '/' + f.path);
          return check.ok;
        })
      : files;
    
    return c.json({ files: filtered });
  } catch (err: any) {
    return c.json({ error: 'Internal list error' }, 500);
  }
});

export default queryApi;
