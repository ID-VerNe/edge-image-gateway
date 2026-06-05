import { MiddlewareHandler } from 'hono';
import { AppEnvironment } from '../types/env';
import { getCookie, setCookie } from 'hono/cookie';
import { dbService } from '../services/database';

export const adminAuthGuard: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  const adminEmailsStr = c.env.ADMIN_EMAILS || '';
  const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  // 1. Check API Token (Authorization: Bearer <token>)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Phase 3: D1 primary
    if (c.env.DB) {
      try {
        const tokenInfo = await dbService.getToken(c.env.DB, token);
        if (tokenInfo) return await next();
      } catch (e) {
        console.error('D1 token check failed:', e);
      }
    }

    // Fallback to KV
    if (c.env.REPO_REGISTRY) {
      const tokenInfo = await c.env.REPO_REGISTRY.get(`auth::token::${token}`, 'json');
      if (tokenInfo) return await next();
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