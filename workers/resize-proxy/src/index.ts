/**
 * resize-proxy
 *
 * Cloudflare Worker that proxies resize requests to the PHP resize server
 * behind a JS challenge (AES-CBC cookie gate). The virtual host at
 * devtools.yuuverne.eu.org requires a valid `__test` cookie before it
 * accepts requests. This worker:
 *
 * 1. Fetches the JS challenge page to get the encrypted token
 * 2. Decrypts it with AES-128-CBC (fixed key/IV from the challenge)
 * 3. Sets the `__test` cookie on the PHP resize request
 * 4. Forwards the image bytes to the PHP resize server
 * 5. Caches the cookie in-memory (per-worker, resets on cold start)
 *
 * The exposed API matches the old img-resize-worker interface so
 * img-proxy can use this as a drop-in replacement via service binding
 * (or via the RESIZE_PHP_URL env var pointing to this worker).
 *
 * POST /resize?w=300&h=200&q=80&fit=cover
 *   body: raw image bytes
 *   header: X-Api-Key (shared secret)
 *   → 200 image/webp
 */

import { Hono } from 'hono';

export interface Env {
  /** Shared secret for auth gate. */
  RESIZE_API_KEY?: string;

  /** The PHP resize server URL (behind JS challenge). */
  RESIZE_PHP_BACKEND?: string;

  /** The JS challenge domain (may differ from resize backend). */
  RESIZE_CHALLENGE_DOMAIN?: string;
}

const app = new Hono<{ Bindings: Env }>();

// AES-128-CBC key and IV — these are hardcoded in the JS challenge
// (aes.js, slowAES.decrypt). The key and IV never change; only the
// ciphertext rotates per request.
const AES_KEY_HEX = 'f655ba9d09a112d4968c63579db590b4';
const AES_IV_HEX = '98344c2eee86c3994890592585b49f80';

// In-memory cookie cache (per-isolate, survives warm starts)
let cachedCookie: string | null = null;
let cookieExpiry = 0;

/**
 * Decrypt AES-128-CBC using the Node.js crypto module (available in workerd
 * via nodejs_compat). We use setAutoPadding(false) because the JS challenge
 * uses slowAES with non-standard PKCS7 padding — for single-block ciphertexts
 * (16 bytes) it doesn't strip padding at all, and the padding bytes may not
 * be valid PKCS7. The Web Crypto API always validates PKCS7 padding, which
 * fails on these non-standard values.
 *
 * The cookie value is the full 16-byte decrypted block, hex-encoded.
 */
// @ts-expect-error — node:crypto is available at runtime via nodejs_compat
import { createDecipheriv } from 'node:crypto';

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

  // Concatenate: update output + final output
  const combined = new Uint8Array(dec.length + final.length);
  combined.set(dec);
  combined.set(final, dec.length);

  return bytesToHex(combined);
}

/**
 * Extract the AES ciphertext from the JS challenge page.
 * Looks for: c=toNumbers("4bcdc872058d4d020c5401e4ae02cba6")
 */
function extractCiphertext(html: string): string | null {
  const match = html.match(/c=toNumbers\("([a-fA-F0-9]{32})"\)/);
  return match?.[1] ?? null;
}

/**
 * Obtain a valid __test cookie by solving the JS challenge.
 * Returns the cookie value, or null on failure.
 */
async function solveChallenge(backendBase: string): Promise<string | null> {
  const challengeUrl = `${backendBase.replace(/\/+$/, '')}/api/api.php`;

  const resp = await fetch(challengeUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
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
 * Get a valid __test cookie, using in-memory cache (per-isolate).
 * Falls back to solving the challenge on cache miss or expiry.
 */
async function getCookie(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedCookie && now < cookieExpiry) {
    return cachedCookie;
  }

  const backend = env.RESIZE_PHP_BACKEND || 'https://devtools.yuuverne.eu.org';
  const cookie = await solveChallenge(backend);
  if (!cookie) throw new Error('failed to solve JS challenge');

  // Cache for 5 hours (slightly under the 6h cookie max-age)
  cachedCookie = cookie;
  cookieExpiry = now + 5 * 60 * 60 * 1000;

  return cookie;
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
  const backend = c.env.RESIZE_PHP_BACKEND || 'https://devtools.yuuverne.eu.org';
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

  // Get __test cookie (solve JS challenge if needed)
  let cookie: string;
  try {
    cookie = await getCookie(c.env);
  } catch (e: any) {
    return c.json({ error: `cookie challenge failed: ${e.message}` }, 502 as any);
  }

  // Build the cookie string — match the Python script's behavior:
  // It sets both __test and CONSENT cookies.
  const cookieStr = `__test=${cookie}; CONSENT=YES+`;

  // Forward to PHP resize server
  try {
    const phpResp = await fetch(phpUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Cookie': cookieStr,
        'Referer': `${backend.replace(/\/+$/, '')}/?i=2`,
        'Origin': backend.replace(/\/+$/, ''),
        // Pass the API key so the PHP backend can authenticate
        ...(c.env.RESIZE_API_KEY
          ? { 'X-Api-Key': c.env.RESIZE_API_KEY }
          : {}),
      },
      body: imageBytes,
    });

    // Read the full response body for debugging
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
      // If it's HTML (JS challenge), try again with a fresh cookie
      if (text.includes('aes.js') || text.includes('toNumbers')) {
        // Cookie was rejected — invalidate cache and retry once
        cachedCookie = null;
        cookieExpiry = 0;
        try {
          const freshCookie = await getCookie(c.env);
          const freshCookieStr = `__test=${freshCookie}; CONSENT=YES+`;
          const retryResp = await fetch(phpUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
          // Still not WebP, return the raw response
          const retryText = new TextDecoder().decode(retryBody);
          return c.json({ error: 'cookie rejected (retry)', detail: retryText.slice(0, 500) }, 502 as any);
        } catch (retryErr: any) {
          return c.json({ error: `retry failed: ${retryErr.message}` }, 502 as any);
        }
      }
      // Not HTML, not WebP — return error with raw content
      return c.json({ error: 'response is not valid WebP', detail: text.slice(0, 500) }, 502 as any);
    }

    // Stream the WebP response back
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