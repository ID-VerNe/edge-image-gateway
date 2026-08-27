import { Context } from 'hono';
import { AppEnvironment } from '../types/env';
import { fetchFromGitHub } from '../services/github';
import { resolveForRead, ResolvedRepo } from '../services/repoRouter';
import { getMimeType } from '../utils/mime';
import { logger } from '../utils/logger';
import { generateHMAC } from '../utils/hmac';
import { recordCacheVariant } from '../utils/cache';
import { r2Cache } from '../utils/r2Cache';
import { normalizePath } from '../utils/path';
import { escapeHtml } from '../utils/escape';

const TRANSFORM_PARAMS = ['w', 'h', 'q', 'fit'];

const buildCacheUrl = (reqUrl: URL): string => {
  const url = new URL(reqUrl.pathname, reqUrl.origin);
  for (const k of TRANSFORM_PARAMS) {
    const v = reqUrl.searchParams.get(k);
    if (v !== null) url.searchParams.set(k, v);
  }
  return url.toString();
};

// @lat: [[image]]
export const handleImageRequest = async (c: Context<AppEnvironment>) => {
  const reqUrl = new URL(c.req.url);
  let path = normalizePath(reqUrl.pathname) || '/';
  if (path === '/') {
    const title = escapeHtml(c.env.APP_TITLE || 'Edge Image Gateway');
    const desc = escapeHtml(c.env.APP_DESCRIPTION || 'Ready to serve images.');
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="icon" type="image/png" href="/favicon.png">
          <link rel="shortcut icon" href="/favicon.ico">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg: #F8FAFC;
              --text-1: #0F172A;
              --text-2: #64748B;
              --primary: #4F46E5;
              --radius: 12px;
            }
            @media (prefers-color-scheme: dark) {
              :root {
                --bg: #0B0E14;
                --text-1: #F8FAFC;
                --text-2: #94A3B8;
              }
            }
            body { 
              font-family: 'Inter', -apple-system, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background-color: var(--bg);
              color: var(--text-1);
              -webkit-font-smoothing: antialiased;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              max-width: 480px;
            }
            h1 { 
              font-size: 3rem; 
              font-weight: 800;
              margin-bottom: 1rem; 
              letter-spacing: -0.04em;
              background: linear-gradient(135deg, var(--text-1) 0%, var(--primary) 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p { 
              font-size: 1.25rem; 
              color: var(--text-2);
              line-height: 1.6;
              font-weight: 400;
            }
            .badge {
              display: inline-block;
              padding: 0.5rem 1rem;
              background: var(--primary);
              color: white;
              border-radius: 999px;
              font-size: 0.875rem;
              font-weight: 600;
              margin-bottom: 2rem;
              box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="badge">Edge Image Gateway</div>
            <h1>${title}</h1>
            <p>${desc}</p>
          </div>
        </body>
      </html>
    `);
  }


  // @lat: [[image#Internal Loopback]]
  const isInternal = reqUrl.searchParams.get('__internal_loopback') === 'true';
  const internalSig = reqUrl.searchParams.get('__sig');
  const internalExp = reqUrl.searchParams.get('__exp');
  const isImage = /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(path);

  if (isInternal && internalSig) {
    if (!isImage) return c.text('Bad Request', 400);

    let sigValid = false;
    if (internalExp) {
      const expTs = parseInt(internalExp, 10);
      if (!isNaN(expTs) && Date.now() / 1000 < expTs) {
        const expectedSig = await generateHMAC(`${path}:${internalExp}`, c.env.SIGN_SECRET);
        sigValid = internalSig === expectedSig;
      }
    }

    if (sigValid) {
      const ghPath = path.replace(/^\/+/, '');
      const repo = await resolveForRead(ghPath, c.env, (p) => c.executionCtx.waitUntil(p));
      const resp = await fetchFromGitHub(ghPath, repo, undefined, c.env, c.executionCtx);
      
      const newResp = new Response(resp.body, resp);
      newResp.headers.set('Content-Type', getMimeType(ghPath));
      
      const detectedMime = getMimeType(ghPath);
      if (detectedMime === 'image/svg+xml') {
        newResp.headers.set('Content-Disposition', 'attachment; filename="image.svg"');
      }
      
      newResp.headers.delete('Server');
      newResp.headers.delete('X-Powered-By');
      newResp.headers.forEach((_, key) => {
        if (key.toLowerCase().startsWith('x-github-')) newResp.headers.delete(key);
      });

      return newResp;
    }
    return c.text('Forbidden', 403);
  }

  const width = reqUrl.searchParams.get('w');
  const height = reqUrl.searchParams.get('h');
  const quality = reqUrl.searchParams.get('q');
  const fit = reqUrl.searchParams.get('fit') as any;
  const isResizing = !!(width || height || quality || fit);

  const cacheUrlStr = buildCacheUrl(reqUrl);
  const cacheKey = new Request(cacheUrlStr, { method: 'GET' });
  const cache = caches.default;

  const startTime = Date.now();

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const duration = Date.now() - startTime;
      logger.info('cache_hit_edge', { path, ms: duration });
      
      const newResponse = new Response(cachedResponse.body, cachedResponse);
      newResponse.headers.set('X-Cache', 'HIT');
      return newResponse;
    }

    const r2Key = r2Cache.generateKey(path, reqUrl.searchParams);
    const r2Object = await r2Cache.get(c.env, r2Key);

    if (r2Object) {
      const duration = Date.now() - startTime;
      logger.info('cache_hit_r2', { path, key: r2Key, ms: duration });

      const ttl = parseInt(c.env.CACHE_TTL_SECONDS || '604800', 10);
      const responseHeaders = new Headers();
      r2Object.writeHttpMetadata(responseHeaders);
      responseHeaders.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}, immutable`);
      responseHeaders.set('X-Cache', 'R2-HIT');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');

      const r2Response = new Response(r2Object.body, { headers: responseHeaders });
      c.executionCtx.waitUntil(cache.put(cacheKey, r2Response.clone()));
      return r2Response;
    }

    let finalResponse: Response;
    let repo: ResolvedRepo | null = null;
    const ghPath = path.replace(/^\/+/, '');

    if (isImage && isResizing) {
      repo = await resolveForRead(ghPath, c.env, (p) => c.executionCtx.waitUntil(p));
      const originResp = await fetchFromGitHub(ghPath, repo, undefined, c.env, c.executionCtx);

      if (originResp.status !== 200) {
        finalResponse = originResp;
      } else {
        const originBytes = new Uint8Array(await originResp.arrayBuffer());

        const resizeUrl = new URL('http://internal/resize');
        if (width) resizeUrl.searchParams.set('w', width);
        if (height) resizeUrl.searchParams.set('h', height);
        if (quality) resizeUrl.searchParams.set('q', quality);
        if (fit) resizeUrl.searchParams.set('fit', fit);

        try {
          if (c.env.RESIZE_PHP_URL) {
            const phpUrl = new URL(c.env.RESIZE_PHP_URL);
            if (width) phpUrl.searchParams.set('w', width);
            if (height) phpUrl.searchParams.set('h', height);
            if (quality) phpUrl.searchParams.set('q', quality);
            if (fit) phpUrl.searchParams.set('fit', fit);
            phpUrl.searchParams.set('lossless', '0');

            finalResponse = await fetch(phpUrl.toString(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                ...(c.env.RESIZE_API_KEY
                  ? { 'X-Api-Key': c.env.RESIZE_API_KEY }
                  : {}),
              },
              body: originBytes,
            });
          } else {
            finalResponse = await c.env.IMAGE_RESIZE_WORKER.fetch(resizeUrl.toString(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                ...(c.env.RESIZE_API_KEY
                  ? { 'X-Api-Key': c.env.RESIZE_API_KEY }
                  : {}),
              },
              body: originBytes,
            });
          }

          if (!finalResponse.ok) {
            logger.warn('resize_worker_failed', {
              path, status: finalResponse.status, backend: c.env.RESIZE_PHP_URL ? 'php' : 'worker',
            });
            finalResponse = new Response(originBytes, {
              status: 200,
              headers: { 'Content-Type': getMimeType(ghPath) },
            });
          }
        } catch (e: any) {
          logger.error('resize_worker_error', { path, error: e.message, backend: c.env.RESIZE_PHP_URL ? 'php' : 'worker' });
          finalResponse = new Response(originBytes, {
            status: 200,
            headers: { 'Content-Type': getMimeType(ghPath) },
          });
        }
      }
    } else {
      repo = await resolveForRead(ghPath, c.env, (p) => c.executionCtx.waitUntil(p));
      finalResponse = await fetchFromGitHub(ghPath, repo, undefined, c.env, c.executionCtx);
    }

    const status = finalResponse.status;

    if (status !== 200) {
      if (status === 404) return c.text('Not Found', 404);
      if (status === 401 || status === 403) return c.text('Forbidden: Origin Access Denied', 403);
      if (status >= 500) return c.text('Bad Gateway: Origin Server Error', 502);
      return c.text('Origin Error', 502);
    }

    const ttl = parseInt(c.env.CACHE_TTL_SECONDS || '604800', 10);
    const responseHeaders = new Headers(finalResponse.headers);
    responseHeaders.delete('Server');
    responseHeaders.delete('Set-Cookie');
    responseHeaders.delete('Content-Disposition');
    responseHeaders.delete('Link');
    responseHeaders.delete('X-Powered-By');
    
    const headersToDelete: string[] = [];
    responseHeaders.forEach((_, key) => {
      if (key.toLowerCase().startsWith('x-github-') || key.toLowerCase().startsWith('access-control-')) {
        headersToDelete.push(key);
      }
    });
    headersToDelete.forEach(key => responseHeaders.delete(key));

    let detectedMime = getMimeType(ghPath);
    const currentType = responseHeaders.get('Content-Type');
    if (!currentType || currentType.includes('application/json') || currentType.includes('application/vnd.github') || currentType === 'application/octet-stream') {
      responseHeaders.set('Content-Type', detectedMime);
    } else {
      detectedMime = currentType;
    }
    responseHeaders.set('Vary', 'Accept');
    responseHeaders.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}, immutable`);
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Cache', 'MISS');
    
    if (detectedMime === 'image/svg+xml') {
      responseHeaders.set('Content-Disposition', 'attachment; filename="image.svg"');
    }

    let responseBody: any = finalResponse.body;
    if (isImage) {
      const buffer = await finalResponse.arrayBuffer();
      responseBody = buffer;

      c.executionCtx.waitUntil((async () => {
        try {
          await r2Cache.put(c.env, r2Key, buffer, detectedMime);
          logger.info('cache_save_r2', { path, key: r2Key });
        } catch (e: any) {
          logger.error('cache_save_r2_failed', { path, error: e.message });
        }
      })());
    }

    const outputResponse = new Response(responseBody, {
      status: 200,
      headers: responseHeaders
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, outputResponse.clone()));
    const hasTransformParams = TRANSFORM_PARAMS.some(k => reqUrl.searchParams.get(k) !== null);
    if (hasTransformParams) {
      c.executionCtx.waitUntil(recordCacheVariant(ghPath, cacheUrlStr, c.env));
    }

    const duration = Date.now() - startTime;
    logger.info('request_done', { path, status, ms: duration });
    
    return outputResponse;

  } catch (error: any) {
    logger.error('internal_error', { path, error: error.message });
    return c.text('Internal Server Error', 500);
  }
};
