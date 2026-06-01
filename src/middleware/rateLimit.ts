import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

// In-memory counters for ephemeral rate limiting
const requestCounts = new Map<string, { count: number, resetAt: number }>();
const errorCounts = new Map<string, { count: number, resetAt: number }>();

/**
 * Enhanced Rate Limiter
 * 1. Global IP-based Limit
 * 2. 404 Penalty: If an IP triggers > 20 "404 Not Found" in a minute, block for 5 mins.
 */
export const rateLimitGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  
  // 1. Global Rate Limit Check
  const rateLimit = parseInt(c.env.RATE_LIMIT_PER_MIN || '120', 10);
  const globalKey = `g:${ip}:${minuteBucket}`;
  
  let globalRecord = requestCounts.get(globalKey);
  if (!globalRecord) {
    globalRecord = { count: 0, resetAt: (minuteBucket + 1) * 60000 };
    requestCounts.set(globalKey, globalRecord);
  }
  globalRecord.count++;

  if (globalRecord.count > rateLimit) {
    return c.text('Too Many Requests', 429, { 'Retry-After': '60' });
  }

  // 2. 404 Penalty Check (Pre-execution)
  // We check the "5-minute block" key
  const blockKey = `block:${ip}`;
  const blockRecord = errorCounts.get(blockKey);
  if (blockRecord && blockRecord.resetAt > now) {
    logger.warn('ip_blocked_due_to_404s', { ip, path: c.req.path });
    return c.text('Forbidden: Too many 404 errors. Temporarily banned.', 403);
  }

  // 3. Execute Request
  await next();

  // 4. Post-execution: 404 Tracking
  if (c.res.status === 404) {
    const errorKey = `404:${ip}:${minuteBucket}`;
    let errorRecord = errorCounts.get(errorKey);
    if (!errorRecord) {
      errorRecord = { count: 0, resetAt: (minuteBucket + 1) * 60000 };
      errorCounts.set(errorKey, errorRecord);
    }
    errorRecord.count++;

    // Threshold: 20 errors per minute
    if (errorRecord.count > 20) {
      logger.error('404_threshold_exceeded', { ip, count: errorRecord.count });
      // Ban for 5 minutes
      errorCounts.set(blockKey, { count: 1, resetAt: now + 5 * 60 * 1000 });
    }
  }

  // 5. Cleanup
  if (Math.random() < 0.05) {
    [requestCounts, errorCounts].forEach(map => {
      for (const [k, v] of map.entries()) {
        if (v.resetAt < now) map.delete(k);
      }
    });
  }
};
