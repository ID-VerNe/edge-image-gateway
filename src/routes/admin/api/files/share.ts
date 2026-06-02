import { Hono } from 'hono';
import { AppEnvironment } from '../../../../types/env';
import { generateHMAC } from '../../../../utils/hmac';

const shareApi = new Hono<AppEnvironment>();

shareApi.post('/', async (c) => {
  try {
    const { path, expires } = await c.req.json() as { path: string, expires: number };
    if (!path) return c.json({ error: 'Path is required' }, 400);

    const secret = c.env.SIGN_SECRET;
    if (!secret) return c.json({ error: 'SIGN_SECRET not configured' }, 500);

    const exp = Math.floor(Date.now() / 1000) + (expires || 86400);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const message = `${normalizedPath}|${exp}`;
    const sig = await generateHMAC(message, secret);

    return c.json({ 
      success: true, 
      sig, 
      exp,
      url: `${new URL(c.req.url).origin}${normalizedPath}?sig=${sig}&exp=${exp}`
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to generate signature', message: err.message }, 500);
  }
});

export default shareApi;
