import { MiddlewareHandler } from 'hono';
import { AppEnvironment } from '../types/env';
import { getCookie, setCookie } from 'hono/cookie';
import { dbService } from '../services/database';

export const adminAuthGuard: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  const adminEmailsStr = c.env.ADMIN_EMAILS || '';
  const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  let tokenInfo: any = null;

  // 1. Check API Token (Authorization: Bearer <token>)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Phase 3: D1 primary
    if (c.env.DB) {
      try {
        tokenInfo = await dbService.getToken(c.env.DB, token);
      } catch (e) {
        console.error('D1 token check failed:', e);
      }
    }

    // Fallback to KV
    if (!tokenInfo && c.env.REPO_REGISTRY) {
      tokenInfo = await c.env.REPO_REGISTRY.get(`auth::token::${token}`, 'json');
    }

    if (tokenInfo) {
      // Expiry check
      if (tokenInfo.expiresAt && Date.now() > new Date(tokenInfo.expiresAt).getTime()) {
        return c.json({ error: 'Token expired' }, 403);
      }

      // Path prefix check
      if (tokenInfo.pathPrefix) {
        const reqPath = c.req.path.replace('/admin/api', '');
        // Usually file operations are under /files/:path or /upload
        // So we only restrict path prefix for these
        if (reqPath.startsWith('/files/') || reqPath.startsWith('/upload')) {
           const targetPath = c.req.query('path') || reqPath.replace('/files/', '/');
           if (!targetPath.startsWith(tokenInfo.pathPrefix) && !targetPath.startsWith('/' + tokenInfo.pathPrefix)) {
             return c.json({ error: 'Token is restricted to path prefix: ' + tokenInfo.pathPrefix }, 403);
           }
        }
      }

      // Scope check
      const method = c.req.method;
      const scopes = tokenInfo.permissions || ['read', 'write', 'delete'];
      if (method === 'POST' && !scopes.includes('write')) return c.json({ error: 'Write permission required' }, 403);
      if (method === 'DELETE' && !scopes.includes('delete')) return c.json({ error: 'Delete permission required' }, 403);
      if (method === 'GET' && !scopes.includes('read')) return c.json({ error: 'Read permission required' }, 403);

      // Async update lastUsedAt
      if (c.env.DB) {
        c.executionCtx.waitUntil(dbService.updateTokenLastUsed(c.env.DB, token).catch(() => {}));
      }
      if (c.env.REPO_REGISTRY) {
        tokenInfo.lastUsedAt = new Date().toISOString();
        c.executionCtx.waitUntil(c.env.REPO_REGISTRY.put(`auth::token::${token}`, JSON.stringify(tokenInfo)).catch(() => {}));
      }

      c.set('tokenInfo', tokenInfo);
      return await next();
    }
  }

  // 2. Check Cloudflare Access Header
  const cfAccessEmail = c.req.header('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase();

  // 3. Check Session Cookie
  const sessionToken = getCookie(c, 'admin_session');

  let isAuthenticated = false;

  if (cfAccessEmail && adminEmails.includes(cfAccessEmail)) {
    isAuthenticated = true;
    // Set or refresh session cookie
    setCookie(c, 'admin_session', cfAccessEmail, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24 // 24 hours
    });
  } else if (sessionToken && adminEmails.includes(sessionToken)) {
    isAuthenticated = true;
  }

  if (adminEmails.length === 0) {
    return c.json({ error: 'Unauthorized: Admin not configured' }, 401);
  }

  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized: Access Denied' }, 401);
  }

  await next();
};