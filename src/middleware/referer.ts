import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

export const refererGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const referer = c.req.header('Referer') || c.req.header('Origin');
  const allowedStr = c.env.ALLOWED_REFERERS || '';
  
  if (!allowedStr) {
    return await next(); // If no whitelist is configured, allow all
  }

  const allowedDomains = allowedStr.split(',').map(d => d.trim().toLowerCase());

  // Optionally allow empty referers (e.g., direct browser access)
  // For strict production, you might want to uncomment the block below:
  /*
  if (!referer) {
    logger.warn('empty_referer_blocked', { path: c.req.path });
    return c.text('Forbidden: Missing Referer', 403);
  }
  */

  if (referer) {
    try {
      const url = new URL(referer);
      const hostname = url.hostname.toLowerCase();
      
      const isAllowed = allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        logger.warn('referer_blocked', { referer, path: c.req.path });
        return c.text('Forbidden: Invalid Referer', 403);
      }
    } catch (e) {
      logger.warn('invalid_referer_url', { referer });
      return c.text('Forbidden: Invalid Referer URL', 403);
    }
  }

  await next();
};
