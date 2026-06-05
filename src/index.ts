import { Hono } from 'hono';
import { AppEnvironment } from './types/env';
import { refererGuard } from './middleware/referer';
import { rateLimitGuard } from './middleware/rateLimit';
import { signatureGuard } from './middleware/signature';
import { handleImageRequest } from './routes/image';
import adminApp from './routes/admin';
import { syncCapacity } from './services/cron';
import { logger } from './utils/logger';
import { alertThrottled } from './utils/notifications';

import { listAllRepos } from './services/repoRouter';
import { checkConfig } from './utils/configCheck';

import { FAVICON_BASE64 } from './utils/favicon';

const app = new Hono<AppEnvironment>();

// Serve Favicon
const serveFavicon = (c: any) => {
  const binary = atob(FAVICON_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  return c.body(bytes);
};

app.get('/favicon.ico', serveFavicon);
app.get('/favicon.png', serveFavicon);

// Health check (no middleware applied to avoid being blocked)
app.get('/healthz', async (c) => {
  const cfg = checkConfig(c.env);
  
  let githubRate: Record<string, any> = {};
  if (c.env.REPO_REGISTRY) {
    try {
      const repos = await listAllRepos(c.env);
      const rates = await Promise.all(repos.map(async (repo) => {
        const raw = await c.env.REPO_REGISTRY.get(`github_rate::${repo.id}`);
        return { repo: repo.id, ...(raw ? JSON.parse(raw) : { remaining: null }) };
      }));
      githubRate = rates;
    } catch (e) {
      console.error('Failed to fetch github rate for healthz:', e);
    }
  }

  return c.json({ 
    ok: true,
    status: cfg.ok ? 'ok' : 'config_error',
    version: '1.0.0',
    config: cfg.ok ? 'valid' : cfg.issues,
    githubRate,
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
  const errorId = crypto.randomUUID();
  const isDev = c.env.ENVIRONMENT !== 'production';

  console.error(`[${errorId}]`, err.stack ?? err);
  logger.captureError(c, err, { path: c.req.path, method: c.req.method, errorId });

  // Telegram Alert for 5xx
  c.executionCtx.waitUntil(alertThrottled('global_500', 
    `🔥 <b>Critical System Error (500)</b>\nPath: <code>${c.req.path}</code>\nMethod: <b>${c.req.method}</b>\nError ID: <code>${errorId}</code>\nError: <code>${err.message}</code>`,
    c.env, 1
  ));

  const body = isDev
    ? { error: 'Unhandled Exception', message: err.message, stack: err.stack, errorId }
    : { error: 'Internal Server Error', errorId };

  return c.json(body, 500);
});

// Mount Admin UI and APIs
app.use('/admin/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});
app.route('/admin', adminApp);

// Main image routing
app.get('/*', handleImageRequest);

export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: AppEnvironment['Bindings'], ctx: any) => {
    ctx.waitUntil((async () => {
      try {
        const results = await syncCapacity(env, ctx);
        logger.info('cron_sync_capacity', { results });
      } catch (err: any) {
        logger.error('cron_sync_capacity_error', { message: err.message });
      }
    })());
  }
};
