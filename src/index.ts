import { Hono } from 'hono';
import { AppEnvironment } from './types/env';
import { refererGuard } from './middleware/referer';
import { rateLimitGuard } from './middleware/rateLimit';
import { signatureGuard } from './middleware/signature';
import { handleImageRequest } from './routes/image';
import adminApp from './routes/admin';
import { syncCapacity } from './services/cron';
import { logger } from './utils/logger';

const app = new Hono<AppEnvironment>();

// Health check (no middleware applied to avoid being blocked)
app.get('/healthz', (c) => {
  const envReady = !!(c.env.GITHUB_TOKEN && c.env.GITHUB_USER && c.env.GITHUB_REPO);
  return c.json({ 
    ok: true, 
    version: '1.0.0',
    env_configured: envReady,
    features: {
      signature: c.env.ENABLE_SIGNATURE === 'true',
      referer_protection: !!c.env.ALLOWED_REFERERS
    }
  });
});

// Apply global middlewares
app.use('/*', rateLimitGuard);
app.use('/*', refererGuard);
app.use('/*', signatureGuard);

// Global Error Handler
app.onError((err, c) => {
  console.error('Global error:', err);
  logger.captureError(c, err, { path: c.req.path, method: c.req.method });
  return c.json({
    error: 'Unhandled Exception',
    message: err.message,
    stack: err.stack, // Helpful for debugging
  }, 500);
});

// Mount Admin UI and APIs
app.route('/admin', adminApp);

// Main image routing
app.get('/*', handleImageRequest);

export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: AppEnvironment['Bindings'], ctx: any) => {
    ctx.waitUntil((async () => {
      try {
        const results = await syncCapacity(env);
        logger.info('cron_sync_capacity', { results });
      } catch (err: any) {
        logger.error('cron_sync_capacity_error', { message: err.message });
      }
    })());
  }
};