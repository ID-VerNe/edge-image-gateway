import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { logger } from '../utils/logger';

// In a real production environment, use Cloudflare KV or Durable Objects for distributed rate limiting.
// Here we provide a simple example structure. Since Cloudflare Workers execution environments 
// are ephemeral and isolated, in-memory Maps are per-isolate and won't perfectly rate limit across 
// the globe, but provide a basic defense. 
// For Stage 5 proper implementation, Cloudflare WAF rate limiting is strongly recommended (zero code).
const requestCounts = new Map<string, { count: number, resetAt: number }>();

export const rateLimitGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const rateLimit = parseInt(c.env.RATE_LIMIT_PER_MIN || '120', 10);
  
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  const key = `${ip}:${minuteBucket}`;

  let record = requestCounts.get(key);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: (minuteBucket + 1) * 60000 };
    requestCounts.set(key, record);
  }

  record.count++;

  if (record.count > rateLimit) {
    logger.warn('rate_limited', { ip, path: c.req.path, count: record.count });
    return c.text('Too Many Requests', 429, { 'Retry-After': '60' });
  }

  // Basic cleanup to prevent memory leaks in the isolate
  if (Math.random() < 0.01) {
    for (const [k, v] of requestCounts.entries()) {
      if (v.resetAt < now) {
        requestCounts.delete(k);
      }
    }
  }

  await next();
};
