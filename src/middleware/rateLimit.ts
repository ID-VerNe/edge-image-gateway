import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

// In-memory cache for local rate limiting
const localCache = new Map<string, { count: number; expires: number }>();
const localBans = new Map<string, number>();

/**
 * Enhanced Rate Limiter (In-memory only — no KV dependency)
 * 1. Local IP-based Limit: Uses in-memory Map for efficiency (per isolate).
 * 2. 404 Penalty: If an IP triggers > 20 "404 Not Found" in a minute, ban in-memory.
 */
// @lat: [[rateLimit]]
export const rateLimitGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const path = c.req.path;

  // Skip rate limiting only for health check
  if (path === '/healthz') {
    return await next();
  }

  // Admin API has stricter rate limit to prevent brute force
  const isAdminApi = path.startsWith('/admin/api');
  const rateLimit = isAdminApi 
    ? parseInt((c.env as any).ADMIN_RATE_LIMIT_PER_MIN || '30', 10) 
    : parseInt(c.env.RATE_LIMIT_PER_MIN || '600', 10);

  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);

  // 1. Check if explicitly banned (in-memory only)
  const localBanExpiry = localBans.get(ip);
  if (localBanExpiry && localBanExpiry > now) {
    return c.text('Forbidden: Temporarily banned.', 403);
  }

  // 2. Local Rate Limit Check (In-memory is much cheaper than KV)
  const rlKey = `${ip}::${minuteBucket}`;

  const record = localCache.get(rlKey);
  if (record && record.expires > now) {
    if (record.count > rateLimit) {
      return c.text('Too Many Requests', 429, { 'Retry-After': '60' });
    }
    record.count++;
  } else {
    localCache.set(rlKey, { count: 1, expires: (minuteBucket + 1) * 60000 });
    // Cleanup old records occasionally
    if (localCache.size > 1000) {
      for (const [key, val] of localCache.entries()) {
        if (val.expires < now) localCache.delete(key);
      }
    }
  }

  // 3. Execute Request
  await next();

  // @lat: [[rateLimit#404 Tracking]]
  // 4. Post-execution: 404 Tracking (in-memory only)
  if (c.res.status === 404) {
    const errorKey = `err404::${ip}::${minuteBucket}`;

    const errorRecord = localCache.get(errorKey);
    const errorCount = errorRecord ? errorRecord.count : 0;
    const newErrorCount = errorCount + 1;

    localCache.set(errorKey, { count: newErrorCount, expires: (minuteBucket + 2) * 60000 });

    // Ban in-memory if threshold exceeded
    if (newErrorCount > 20) {
      logger.error('404_threshold_exceeded', { ip, count: newErrorCount });
      localBans.set(ip, now + 300000); // 5 minute ban
    }
  }
};