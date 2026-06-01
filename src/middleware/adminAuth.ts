import { MiddlewareHandler } from 'hono';
import { AppEnvironment } from '../types/env';
import { getCookie, setCookie } from 'hono/cookie';

export const adminAuthGuard: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  const adminEmailsStr = c.env.ADMIN_EMAILS || '';
  const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  // 1. Check Cloudflare Access Header
  const cfAccessEmail = c.req.header('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase();
  
  // 2. Check Session Cookie
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

  // If running locally without CF Access, we can optionally allow a bypass or fallback 
  // but for production security, we enforce the check.
  // For development (if no ADMIN_EMAILS are configured), we could bypass, 
  // but let's be strict or rely on a dev header.
  if (adminEmails.length === 0) {
    // If not configured, we allow it only if running in a dev environment? 
    // It's safer to deny access.
    return c.json({ error: 'Unauthorized: Admin not configured' }, 401);
  }

  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized: Access Denied' }, 401);
  }

  await next();
};