import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { generateHMAC } from '../utils/hmac';
import { logger } from '../utils/logger';

export const signatureGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const enableSig = c.env.ENABLE_SIGNATURE === 'true';
  const isPrivate = c.req.path.startsWith('/private/');
  
  if (!enableSig && !isPrivate) {
    return await next();
  }

  const sig = c.req.query('sig');
  const exp = c.req.query('exp');
  
  if (!sig || !exp) {
    logger.warn('missing_signature', { path: c.req.path });
    return c.text('Forbidden: Missing Signature', 403);
  }

  const expNum = parseInt(exp, 10);
  if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    logger.warn('expired_signature', { path: c.req.path, exp });
    return c.text('Forbidden: Expired Signature', 403);
  }

  const secret = c.env.SIGN_SECRET;
  if (!secret) {
    logger.error('missing_sign_secret', { path: c.req.path });
    return c.text('Internal Server Error: Missing Secret', 500);
  }

  // To verify: we re-calculate HMAC of path|exp and compare
  const message = `${c.req.path}|${exp}`;
  const expectedSig = await generateHMAC(message, secret);

  if (sig !== expectedSig) {
    logger.warn('invalid_signature', { path: c.req.path });
    return c.text('Forbidden: Invalid Signature', 403);
  }

  await next();
};
