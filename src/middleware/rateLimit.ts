import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

// In-memory cache for local rate limiting
const localCache = new Map<string, { count: number; expires: number }>();
const localBans = new Map<string, number>();

/**
 * Enhanced Rate Limiter (Hybrid: In-memory + KV for Bans)
 * 1. Local IP-based Limit: Uses in-memory Map for efficiency (per isolate).
 * 2. 404 Penalty: If an IP triggers > 20 "404 Not Found" in a minute, block globally via KV.
 */
export const rateLimitGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const kv = c.env.REPO_REGISTRY;
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const path = c.req.path;

  // Skip rate limiting for system paths
  if (path === '/healthz' || path.startsWith('/admin')) {
    return await next();
  }

  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  
  // 1. Check if explicitly banned (KV check is cached in memory for 1 minute)
  const banKey = `ban::${ip}`;
  const localBanExpiry = localBans.get(ip);
  if (localBanExpiry && localBanExpiry > now) {
    return c.text('Forbidden: Temporarily banned.', 403);
  }

  if (kv) {
    const isBanned = await kv.get(banKey, { cacheTtl: 60 });
    if (isBanned) {
      localBans.set(ip, now + 60000);
      logger.warn('request_blocked_banned_ip', { ip, path });
      return c.text('Forbidden: Too many 404 errors. Temporarily banned.', 403);
    }
  }

  // 2. Local Rate Limit Check (In-memory is much cheaper than KV)
  const rateLimit = parseInt(c.env.RATE_LIMIT_PER_MIN || '120', 10);
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

  // 4. Post-execution: 404 Tracking (Use in-memory first, only write to KV on ban)
  if (c.res.status === 404) {
    const errorKey = `err404::${ip}::${minuteBucket}`;

    // Track in local memory first
    const errorRecord = localCache.get(errorKey);
    const errorCount = errorRecord ? errorRecord.count : 0;
    const newErrorCount = errorCount + 1;

    localCache.set(errorKey, { count: newErrorCount, expires: (minuteBucket + 2) * 60000 });

    // Only write to KV if threshold exceeded (reduces KV writes by 95%)
    if (newErrorCount > 20 && kv) {
      c.executionCtx.waitUntil((async () => {
        try {
          logger.error('404_threshold_exceeded', { ip, count: newErrorCount });
          await kv.put(banKey, '1', { expirationTtl: 300 });
          localBans.set(ip, now + 300000);
        } catch {}
      })());
    }
  }
};
