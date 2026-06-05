import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

/**
 * Hybrid Defense Referer Guard
 * 1. Skips check for /private/, /draft/, /raw/ (these strictly require HMAC signatures elsewhere).
 * 2. Enforces ALLOWED_REFERERS whitelist for general image access.
 * 3. Handles empty Referer using Sec-Fetch-Dest: image to allow legitimate browser loads while blocking tools.
 */
export const refererGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const reqUrl = new URL(c.req.url);
  // Normalize path: decode and ensure leading slash
  let path = reqUrl.pathname;
  try {
    path = decodeURIComponent(path);
  } catch (e) {}
  if (!path.startsWith('/')) path = '/' + path;

  const sig = c.req.query('sig');
  const internalSig = c.req.query('__sig');
  
  // Skip referer check for strictly signed paths, system paths, or requests with a signature
  if (path === '/healthz' || path === '/' || path.startsWith('/admin') || 
      path.startsWith('/private/') || path.startsWith('/draft/') || path.startsWith('/raw/') ||
      sig || internalSig) {
    return await next();
  }

  const referer = c.req.header('Referer');
  const origin = c.req.header('Origin');
  const fetchDest = c.req.header('Sec-Fetch-Dest');
  
  const allowedStr = c.env.ALLOWED_REFERERS || '';
  if (!allowedStr) return await next();

  const allowedDomains = allowedStr.split(',').map(d => d.trim().toLowerCase());

  // Handle Empty Referer
  if (!referer && !origin) {
    // If browser says it's an image load, allow it (e.g. direct access or image tag without referer policy)
    if (fetchDest === 'image') {
      return await next();
    }
    // Block automated tools/crawlers with no referer
    logger.warn('empty_referer_blocked', { path, ip: c.req.header('CF-Connecting-IP') });
    return c.text('Forbidden: Invalid Access Pattern', 403);
  }

  // Validate Referer/Origin
  const target = referer || origin || '';
  try {
    const url = new URL(target);
    const hostname = url.hostname.toLowerCase();
    
    const isAllowed = allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      logger.warn('referer_blocked', { target, path });
      return c.text('Forbidden: Invalid Referer', 403);
    }
  } catch (e) {
    logger.warn('invalid_referer_format', { target });
    return c.text('Forbidden: Invalid Access Source', 403);
  }

  await next();
};
