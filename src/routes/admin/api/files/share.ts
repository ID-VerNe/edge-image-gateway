import { Hono } from 'hono';
import { AppEnvironment } from '../../../../types/env';
import { generateHMAC } from '../../../../utils/hmac';
import { normalizePathForHMAC } from '../../../../utils/path';
import { checkPathPrefix } from '../../../../middleware/adminAuth';

const shareApi = new Hono<AppEnvironment>();

shareApi.post('/', async (c) => {
  try {
    const { path, expires } = await c.req.json() as { path: string, expires: number };
    if (!path) return c.json({ error: 'Path is required' }, 400);

    const secret = c.env.SIGN_SECRET;
    if (!secret) return c.json({ error: 'SIGN_SECRET not configured' }, 500);

    const normalizedPath = normalizePathForHMAC(path);
    if (!normalizedPath) return c.json({ error: 'Invalid path' }, 400);

    const tokenInfo = c.get('tokenInfo' as any);
    const prefixCheck = checkPathPrefix(tokenInfo, normalizedPath);
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

    const exp = Math.floor(Date.now() / 1000) + (expires || 86400);
    const message = `${normalizedPath}|${exp}`;
    const sig = await generateHMAC(message, secret);

    const origin = c.env.APP_URL || new URL(c.req.url).origin;

    return c.json({ 
      success: true, 
      sig, 
      exp,
      url: `${origin}${normalizedPath}?sig=${sig}&exp=${exp}`
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to generate signature' }, 500);
  }
});

export default shareApi;
