import { Hono } from 'hono';
import { AppEnvironment } from '../types/env';
import { adminAuthGuard } from '../middleware/adminAuth';

// Import UI Components
import { CSS } from './admin/styles';
import { PARTIALS } from './admin/partials';
import { SCRIPTS } from './admin/scripts';

// Import Sub-Routers
import repoApi from './admin/api/repos';
import fileApi from './admin/api/files';
import uploadApi from './admin/api/upload';
import statsApi from './admin/api/stats';

const adminApp = new Hono<AppEnvironment>();

// Apply auth middleware to all admin routes
adminApp.use('/*', adminAuthGuard);

// Force no-cache for all API routes
adminApp.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

// Mount API Sub-Routers
adminApp.route('/api/repos', repoApi);
adminApp.route('/api/files', fileApi);
adminApp.route('/api/upload', uploadApi);
adminApp.route('/api/stats', statsApi);

// Cache Purge
adminApp.post('/api/cache/purge', async (c) => {
  const zoneId = c.env.CF_ZONE_ID;
  const apiToken = c.env.CF_API_TOKEN;

  if (!zoneId || !apiToken) {
    return c.json({ 
      success: false, 
      message: 'CF_ZONE_ID or CF_API_TOKEN not configured. Please set them as secrets.' 
    }, 400);
  }

  try {
    const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ purge_everything: true })
    });

    if (!cfRes.ok) {
      const errText = await cfRes.text();
      return c.json({ success: false, message: 'Cloudflare API error', details: errText }, 500);
    }

    return c.json({ success: true, message: 'Global cache purge successful' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// --- Admin UI Entry Point ---

adminApp.get('/', (c) => {
  const userEmail = c.req.header('Cf-Access-Authenticated-User-Email') || 'Admin';
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <title>Edge Image Gateway - Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>${CSS}</style>
    </head>
    <body>
      ${PARTIALS.header(userEmail)}

      <div class="app-container">
        ${PARTIALS.sidebar}
        ${PARTIALS.mainFiles}
        ${PARTIALS.mainRepos}
        ${PARTIALS.mainTokens}
      </div>

      ${PARTIALS.modals}

      <script>
        window.DEFAULT_GITHUB_USER = "${c.env.GITHUB_USER}";
        window.DEFAULT_GITHUB_REPO = "${c.env.GITHUB_REPO}";
        ${SCRIPTS}
      </script>
    </body>
    </html>
  `);
});

export default adminApp;
