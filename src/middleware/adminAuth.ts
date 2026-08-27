import { MiddlewareHandler } from 'hono';
import { AppEnvironment } from '../types/env';
import { getCookie, setCookie } from 'hono/cookie';
import { dbService } from '../services/database';
import { generateHMAC, timingSafeEqual } from '../utils/hmac';
import { normalizePath } from '../utils/path';

export const checkPathPrefix = (tokenInfo: any, ...paths: (string | undefined | null)[]): { ok: boolean; error?: string } => {
  if (!tokenInfo?.pathPrefix) return { ok: true };
  
  const prefix = tokenInfo.pathPrefix.replace(/^\/+|\/+$/g, '');
  for (const p of paths) {
    if (!p) continue;
    const normalized = normalizePath('/' + String(p).replace(/^\/+/, ''));
    if (!normalized) return { ok: false, error: 'Invalid path' };
    if (normalized !== '/' + prefix && !normalized.startsWith('/' + prefix + '/')) {
      return { ok: false, error: 'Token is restricted to path prefix: ' + tokenInfo.pathPrefix };
    }
  }
  return { ok: true };
};

// @lat: [[adminAuth]]
export const adminAuthGuard: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  const adminEmailsStr = c.env.ADMIN_EMAILS || '';
  const adminEmails = adminEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const secret = c.env.SIGN_SECRET;
  
  const isValidSecret = secret && secret.length >= 16;
  if (!isValidSecret) {
    console.warn('WARNING: SIGN_SECRET is not configured properly or too short (<16 chars)');
  }

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

    if (tokenInfo) {
      // Expiry check
      if (tokenInfo.expiresAt && Date.now() > new Date(tokenInfo.expiresAt).getTime()) {
        return c.json({ error: 'Token expired' }, 403);
      }

      // @lat: [[adminAuth#Token Path Prefix Check]]
      // Path prefix check - Token with pathPrefix is restricted to file operations only
      if (tokenInfo.pathPrefix) {
        const reqPath = c.req.path.replace('/admin/api', '');
        
        const systemEndpoints = ['/repos/', '/providers/', '/audit', '/stats/', '/backfill/', '/cache/'];
        const isSystemRequest = systemEndpoints.some(ep => reqPath.startsWith(ep) || reqPath === ep.replace(/\/$/, ''));
        
        if (isSystemRequest) {
          return c.json({ error: 'Token with path restriction cannot access system endpoints' }, 403);
        }
      }

      // Scope check (POST, PUT, PATCH require 'write')
      const method = c.req.method;
      const scopes = tokenInfo.permissions || ['read', 'write', 'delete'];
      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !scopes.includes('write')) {
        return c.json({ error: 'Write permission required' }, 403);
      }
      if (method === 'DELETE' && !scopes.includes('delete')) return c.json({ error: 'Delete permission required' }, 403);
      if (method === 'GET' && !scopes.includes('read')) return c.json({ error: 'Read permission required' }, 403);

      // Update last used timestamp (D1 only)
      if (c.env.DB) {
        c.executionCtx.waitUntil(dbService.updateTokenLastUsed(c.env.DB, token).catch(() => {}));
      }

      c.set('tokenInfo', tokenInfo);
      c.set('user', { email: `token:${tokenInfo.name || token.substring(0, 8)}` });
      return await next();
    }
  }

  // 2. Check Cloudflare Access Header
  const cfAccessEmail = c.req.header('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase();

  // 3. Check Session Cookie (HMAC-signed format: email.signature)
  const sessionToken = getCookie(c, 'admin_session');

  let isAuthenticated = false;
  let authenticatedEmail = '';

  if (cfAccessEmail && adminEmails.includes(cfAccessEmail)) {
    isAuthenticated = true;
    authenticatedEmail = cfAccessEmail;

    if (isValidSecret) {
      const sig = await generateHMAC(`session:${cfAccessEmail}`, secret);
      setCookie(c, 'admin_session', `${cfAccessEmail}.${sig}`, {
        path: '/admin',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict',
        maxAge: 60 * 60 * 24 // 24 hours
      });
    }
  } else if (isValidSecret && sessionToken && sessionToken.includes('.')) {
    const lastDotIndex = sessionToken.lastIndexOf('.');
    const email = sessionToken.substring(0, lastDotIndex);
    const sig = sessionToken.substring(lastDotIndex + 1);

    if (adminEmails.includes(email)) {
      const expectedSig = await generateHMAC(`session:${email}`, secret);
      if (timingSafeEqual(sig, expectedSig)) {
        isAuthenticated = true;
        authenticatedEmail = email;
      }
    }
  }

  if (adminEmails.length === 0) {
    return c.json({ error: 'Unauthorized: Admin not configured' }, 401);
  }

  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized: Access Denied' }, 401);
  }

  c.set('user', { email: authenticatedEmail });
  await next();
};