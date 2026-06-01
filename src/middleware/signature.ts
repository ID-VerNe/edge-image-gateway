import { Context, Next } from 'hono';
import { AppEnvironment } from '../types/env';
import { generateHMAC } from '../utils/hmac';
import { logger } from '../utils/logger';

/**
 * Hardened Signature Middleware (Plan D Implementation)
 * 1. Emergency Lockdown Check
 * 2. Trusted Context (Referer/Origin + Sec-Fetch) bypass
 * 3. Tiered Path Defense (/private/, /draft/, /raw/ forced signature)
 * 4. HMAC Validation with Expiry
 */
export const signatureGuard = async (c: Context<AppEnvironment>, next: Next) => {
  const reqUrl = new URL(c.req.url);
  const path = c.req.path;

  // 1. Skip for health check or root (publicly safe)
  if (path === '/healthz' || path === '/') {
    return await next();
  }

  // 2. Emergency Lockdown Switch
  const isLockdown = c.env.EMERGENCY_LOCKDOWN === 'true';
  if (isLockdown) {
    const sig = c.req.query('sig');
    if (!sig) return c.text('Forbidden: Emergency Lockdown Active. All access requires valid signature.', 403);
  }

  // 3. Trusted Source Identification (The "Crawler Barrier")
  const referer = c.req.header('Referer');
  const origin = c.req.header('Origin');
  const fetchDest = c.req.header('Sec-Fetch-Dest'); // "image" for <img>
  const allowedReferers = (c.env.ALLOWED_REFERERS || '').split(',').map(d => d.trim()).filter(Boolean);

  const checkDomain = (urlStr: string | undefined) => {
    if (!urlStr) return false;
    try {
      const url = new URL(urlStr);
      return allowedReferers.some(domain => 
        url.hostname === domain || url.hostname.endsWith('.' + domain)
      );
    } catch { return false; }
  };

  // Logic: Is this a trusted browser-based request from our allowed sites?
  // Note: Empty referer is NOT trusted by default.
  const isTrustedSource = (checkDomain(referer) || checkDomain(origin)) && (fetchDest === 'image' || !fetchDest);

  // 4. Tiered Path Defense
  const isStrictPath = path.startsWith('/private/') || path.startsWith('/draft/') || path.startsWith('/raw/');
  const isGlobalSignEnabled = c.env.ENABLE_SIGNATURE === 'true';

  // Bypass logic: Trusted sources bypass signature for non-strict/non-lockdown paths
  if (isTrustedSource && !isStrictPath && !isLockdown) {
    return await next();
  }

  // 5. Signature Enforcement
  const sig = c.req.query('sig');
  const exp = c.req.query('exp');

  // If no signature but needed
  if (!sig || !exp) {
    // We force signature if:
    // - Global signature is on
    // - It's a strict path
    // - Access is direct (no referer) and not already bypassed
    if (isGlobalSignEnabled || isStrictPath || !isTrustedSource) {
      logger.warn('access_denied_no_sig', { path, referer });
      return c.text('Forbidden: Valid signature required for this access method or path.', 403);
    }
    return await next();
  }

  // 6. Signature Validation
  const expNum = parseInt(exp, 10);
  if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    logger.warn('expired_signature', { path, exp });
    return c.text('Forbidden: Expired Signature', 403);
  }

  const secret = c.env.SIGN_SECRET;
  const message = `${path}|${exp}`;
  const expectedSig = await generateHMAC(message, secret);

  if (sig !== expectedSig) {
    logger.error('invalid_signature', { path, provided: sig });
    return c.text('Forbidden: Invalid Signature', 403);
  }

  return await next();
};
