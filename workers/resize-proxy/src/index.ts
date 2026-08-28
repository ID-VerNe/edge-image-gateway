/**
 * resize-proxy
 *
 * Cloudflare Worker that proxies resize requests to an external PHP resize server
 * behind a JS challenge.
 *
 * 1. Optionally fetches valid cookie from cookie-bridge service (configured via COOKIE_BRIDGE_URL & COOKIE_BRIDGE_KEY)
 * 2. Falls back to local AES-128-CBC solver if bridge is unreachable or unconfigured
 * 3. Sets the `__test` cookie on the PHP resize request
 * 4. Forwards the image bytes to the PHP resize server
 * 5. Caches the cookie in-memory (per-worker isolate)
 *
 * POST /resize?w=300&h=200&q=80&fit=cover
 *   body: raw image bytes
 *   header: X-Api-Key (shared secret)
 *   → 200 image/webp
 */

import { Hono } from 'hono';
// @ts-expect-error — node:crypto is available at runtime via nodejs_compat
import { createDecipheriv } from 'node:crypto';

export interface Env {
  /** Shared secret for auth gate. */
  RESIZE_API_KEY?: string;

  /** The PHP resize server URL (behind JS challenge). */
  RESIZE_PHP_BACKEND?: string;

  /** The JS challenge domain (may differ from resize backend). */
  RESIZE_CHALLENGE_DOMAIN?: string;

  /** Cookie Bridge Endpoint. */
  COOKIE_BRIDGE_URL?: string;

  /** Cookie Bridge API Key. */
  COOKIE_BRIDGE_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// AES-128-CBC key and IV for local fallback
const AES_KEY_HEX = 'f655ba9d09a112d4968c63579db590b4';
const AES_IV_HEX = '98344c2eee86c3994890592585b49f80';

// In-memory cookie cache (per-isolate, survives warm starts)
let cachedCookie: string | null = null;
let cookieExpiry = 0;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

function aesDecrypt(ciphertextHex: string, keyHex: string, ivHex: string): string {
  const key = hexToBytes(keyHex);
  const iv = hexToBytes(ivHex);
  const ct = hexToBytes(ciphertextHex);

  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  const dec = decipher.update(ct) as Uint8Array;
  const final = decipher.final() as Uint8Array;

  const combined = new Uint8Array(dec.length + final.length);
  combined.set(dec);
  combined.set(final, dec.length);

  return bytesToHex(combined);
}

function extractCiphertext(html: string): string | null {
  const match = html.match(/c=toNumbers\("([a-fA-F0-9]{32})"\)/);
  return match?.[1] ?? null;
}

async function solveChallengeLocally(backendBase: string): Promise<string | null> {
  const challengeUrl = `${backendBase.replace(/\/+$/, '')}/api/api.php`;

  const resp = await fetch(challengeUrl, {
    headers: {
      'User-Agent': CHROME_UA,
    },
  });

  const html = await resp.text();
  const ciphertext = extractCiphertext(html);
  if (!ciphertext) return null;

  try {
    return aesDecrypt(ciphertext, AES_KEY_HEX, AES_IV_HEX);
  } catch {
    return null;
  }
}

/**
 * Get a valid __test cookie:
 * 1. Read from in-memory cache
 * 2. Request from cookie-bridge (if configured)
 * 3. Fallback to local AES-128-CBC solver
 */
async function getCookie(env: Env, forceFresh = false): Promise<string> {
  const now = Date.now();
  if (!forceFresh && cachedCookie && now < cookieExpiry) {
    return cachedCookie;
  }

  // 1. Try cookie-bridge first (if configured in environment)
  const bridgeUrl = env.COOKIE_BRIDGE_URL;
  const bridgeKey = env.COOKIE_BRIDGE_KEY;

  if (bridgeUrl && bridgeKey) {
    try {
      const bridgeResp = await fetch(bridgeUrl, {
        headers: {
          'X-Api-Key': bridgeKey,
          'User-Agent': CHROME_UA,
        },
      });

      if (bridgeResp.ok) {
        const data = await bridgeResp.json() as { cookie?: string; expires?: number };
        if (data?.cookie) {
          cachedCookie = data.cookie;
          cookieExpiry = data.expires && data.expires > now
            ? data.expires - 60000
            : now + 5 * 60 * 60 * 1000;
          return cachedCookie;
        }
      }
    } catch (err) {
      console.error('Failed to fetch from cookie-bridge, falling back to local solver...', err);
    }
  }

  // 2. Fallback to local JS challenge solver
  const backend = env.RESIZE_PHP_BACKEND;
  if (!backend) {
    throw new Error('RESIZE_PHP_BACKEND is not configured');
  }

  const localCookie = await solveChallengeLocally(backend);
  if (localCookie) {
    cachedCookie = localCookie;
    cookieExpiry = now + 5 * 60 * 60 * 1000;
    return localCookie;
  }

  throw new Error('Failed to obtain cookie from both cookie-bridge and local solver');
}

// ─── Auth gate (protect /resize, not /health) ───────────────────────────────────

app.use('/resize', async (c, next) => {
  const expected = c.env.RESIZE_API_KEY;
  if (!expected) return next();
  const provided = c.req.header('x-api-key');
  if (!provided || provided !== expected) {
    return c.json({ error: 'unauthorized' }, 401 as any);
  }
  await next();
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.text('ok'));

// ─── Resize proxy ─────────────────────────────────────────────────────────────

app.post('/resize', async (c) => {
  const backend = c.env.RESIZE_PHP_BACKEND;
  if (!backend) {
    return c.json({ error: 'RESIZE_PHP_BACKEND is not configured' }, 500 as any);
  }

  const phpUrl = new URL(`${backend.replace(/\/+$/, '')}/resize/resize.php`);

  // Forward query params
  const q = c.req.query.bind(c.req);
  const w = q('w') || q('width');
  const h = q('h') || q('height');
  const quality = q('q') || q('quality');
  const fit = q('fit');
  if (w) phpUrl.searchParams.set('w', w);
  if (h) phpUrl.searchParams.set('h', h);
  if (quality) phpUrl.searchParams.set('q', quality);
  if (fit) phpUrl.searchParams.set('fit', fit);
  phpUrl.searchParams.set('lossless', '0');

  // Read image bytes
  const imageBytes = await c.req.arrayBuffer().catch(() => null);
  if (!imageBytes || imageBytes.byteLength === 0) {
    return c.json({ error: 'empty request body' }, 400 as any);
  }

  // Get __test cookie
  let cookie: string;
  try {
    cookie = await getCookie(c.env);
  } catch (e: any) {
    return c.json({ error: `cookie retrieval failed: ${e.message}` }, 502 as any);
  }

  const cookieStr = `__test=${cookie}; CONSENT=YES+`;

  try {
    const phpResp = await fetch(phpUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'User-Agent': CHROME_UA,
        'Cookie': cookieStr,
        'Referer': `${backend.replace(/\/+$/, '')}/?i=2`,
        'Origin': backend.replace(/\/+$/, ''),
        ...(c.env.RESIZE_API_KEY ? { 'X-Api-Key': c.env.RESIZE_API_KEY } : {}),
      },
      body: imageBytes,
    });

    const respBody = await phpResp.arrayBuffer();
    const respBytes = new Uint8Array(respBody);

    if (!phpResp.ok) {
      const text = new TextDecoder().decode(respBody);
      return c.json({ error: `php resize failed: ${phpResp.status}`, detail: text.slice(0, 500) }, phpResp.status as any);
    }

    // Check if the response is valid WebP (starts with RIFF header)
    const isWebP = respBytes.length >= 12 &&
      respBytes[0] === 0x52 && respBytes[1] === 0x49 &&
      respBytes[2] === 0x46 && respBytes[3] === 0x46;

    if (!isWebP) {
      const text = new TextDecoder().decode(respBody);
      // If challenge HTML returned, force fresh cookie and retry once
      if (text.includes('aes.js') || text.includes('toNumbers')) {
        cachedCookie = null;
        cookieExpiry = 0;
        try {
          const freshCookie = await getCookie(c.env, true);
          const freshCookieStr = `__test=${freshCookie}; CONSENT=YES+`;
          const retryResp = await fetch(phpUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'User-Agent': CHROME_UA,
              'Cookie': freshCookieStr,
              'Referer': `${backend.replace(/\/+$/, '')}/?i=2`,
              'Origin': backend.replace(/\/+$/, ''),
              ...(c.env.RESIZE_API_KEY ? { 'X-Api-Key': c.env.RESIZE_API_KEY } : {}),
            },
            body: imageBytes,
          });

          const retryBody = await retryResp.arrayBuffer();
          const retryBytes = new Uint8Array(retryBody);
          const retryWebP = retryBytes.length >= 12 &&
            retryBytes[0] === 0x52 && retryBytes[1] === 0x49 &&
            retryBytes[2] === 0x46 && retryBytes[3] === 0x46;

          if (retryWebP) {
            return new Response(retryBody, {
              status: 200,
              headers: {
                'Content-Type': 'image/webp',
                'Cache-Control': 'no-store',
              },
            });
          }

          const retryText = new TextDecoder().decode(retryBody);
          return c.json({ error: 'cookie rejected (retry)', detail: retryText.slice(0, 500) }, 502 as any);
        } catch (retryErr: any) {
          return c.json({ error: `retry failed: ${retryErr.message}` }, 502 as any);
        }
      }

      return c.json({ error: 'response is not valid WebP', detail: text.slice(0, 500) }, 502 as any);
    }

    return new Response(respBody, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return c.json({ error: `php resize error: ${e.message}` }, 502 as any);
  }
});

export default app;