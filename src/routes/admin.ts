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

// Mount API Sub-Routers
adminApp.route('/api/repos', repoApi);
adminApp.route('/api/files', fileApi);
adminApp.route('/api/upload', uploadApi);
adminApp.route('/api/stats', statsApi);

// Cache Purge (kept here as it's a single endpoint, or could move to stats)
adminApp.post('/api/cache/purge', async (c) => {
  return c.json({ success: true, message: 'Cache purge request received' });
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
      </div>

      ${PARTIALS.modals}

      <script>${SCRIPTS}</script>
    </body>
    </html>
  `);
});

export default adminApp;
