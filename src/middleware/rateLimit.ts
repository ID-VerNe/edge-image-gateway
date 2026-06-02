import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

/**
 * Enhanced Rate Limiter (Distributed via KV)
 * 1. Global IP-based Limit: Uses KV for distributed counting.
 * 2. 404 Penalty: If an IP triggers > 20 "404 Not Found" in a minute, block for 5 mins globally.
 */
export const rateLimitGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const kv = c.env.REPO_REGISTRY;
  if (!kv) return await next(); // Skip if KV not configured (fallback)

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  
  // 1. Check if explicitly banned (404 Penalty)
  const banKey = `ban::${ip}`;
  const isBanned = await kv.get(banKey);
  if (isBanned) {
    logger.warn('request_blocked_banned_ip', { ip, path: c.req.path });
    return c.text('Forbidden: Too many 404 errors. Temporarily banned.', 403);
  }

  // 2. Global Rate Limit Check
  const rateLimit = parseInt(c.env.RATE_LIMIT_PER_MIN || '120', 10);
  const rlKey = `rl::${ip}::${minuteBucket}`;
  
  const currentCountStr = await kv.get(rlKey);
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

  if (currentCount > rateLimit) {
    return c.text('Too Many Requests', 429, { 'Retry-After': '60' });
  }

  // Increment count (Atomic increment is not available in standard KV, so we use get-put)
  // Even with eventual consistency, this is sufficient for rate limiting
  await kv.put(rlKey, (currentCount + 1).toString(), { expirationTtl: 120 });

  // 3. Execute Request
  await next();

  // 4. Post-execution: 404 Tracking
  if (c.res.status === 404) {
    const errorKey = `err404::${ip}::${minuteBucket}`;
    const errorCountStr = await kv.get(errorKey);
    const errorCount = errorCountStr ? parseInt(errorCountStr, 10) : 0;
    const newErrorCount = errorCount + 1;

    // Threshold: 20 errors per minute
    if (newErrorCount > 20) {
      logger.error('404_threshold_exceeded', { ip, count: newErrorCount });
      // Ban for 5 minutes (300 seconds)
      await kv.put(banKey, '1', { expirationTtl: 300 });
    } else {
      await kv.put(errorKey, newErrorCount.toString(), { expirationTtl: 120 });
    }
  }
};
