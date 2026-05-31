import { Hono } from 'hono';
import { AppEnvironment } from './types/env';
import { refererGuard } from './middleware/referer';
import { rateLimitGuard } from './middleware/rateLimit';
import { signatureGuard } from './middleware/signature';
import { handleImageRequest } from './routes/image';

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

// Main image routing
app.get('/*', handleImageRequest);

export default app;
