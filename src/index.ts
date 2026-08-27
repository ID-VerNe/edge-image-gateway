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

import { checkConfig } from './utils/configCheck';

import { FAVICON_PNG_BASE64, FAVICON_ICO_BASE64 } from './utils/favicon';

// @lat: [[index]]
const app = new Hono<AppEnvironment>();

app.get('/healthz', async (c) => {
  const cfg = checkConfig(c.env);

  return c.json({
    ok: cfg.ok,
    status: cfg.ok ? 'ok' : 'config_error',
    version: '1.0.0'
  });
});

app.use('/*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // HTML 页面（admin UI）依赖内联脚本与内联事件处理器，且 Cloudflare 会自动注入 Insights 脚本，
  // 因此仅对 HTML 放宽 script-src；非 HTML 响应保持严格策略
  const contentType = c.res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com");
  } else {
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'");
  }
});

app.get('/favicon.png', (c) => {
  const binary = atob(FAVICON_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(bytes);
});

app.get('/favicon.ico', (c) => {
  const binary = atob(FAVICON_ICO_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  c.header('Content-Type', 'image/x-icon');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(bytes);
});

app.use('/*', rateLimitGuard);
app.use('/*', refererGuard);
app.use('/*', signatureGuard);

app.onError((err, c) => {
  const errorId = crypto.randomUUID();
  const isDev = c.env.ENVIRONMENT !== 'production';

  console.error(`[${errorId}]`, err.stack ?? err);
  logger.captureError(c, err, { path: c.req.path, method: c.req.method, errorId });

  c.executionCtx.waitUntil(alertThrottled('global_500', 
    `🔥 <b>Critical System Error (500)</b>\nPath: <code>${c.req.path}</code>\nMethod: <b>${c.req.method}</b>\nError ID: <code>${errorId}</code>`,
    c.env, 1
  ));

  const body = isDev
    ? { error: 'Unhandled Exception', message: err.message, errorId }
    : { error: 'Internal Server Error' };

  return c.json(body, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

app.use('/admin/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});
app.route('/admin', adminApp);

app.get('/*', handleImageRequest);

// @lat: [[index#Scheduled Tasks]]
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
