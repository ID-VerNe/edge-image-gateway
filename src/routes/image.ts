import { Context } from 'hono';
import { AppEnvironment } from '../types/env';
import { fetchFromGitHub } from '../services/github';
import { resolveForRead } from '../services/repoRouter';
import { getMimeType } from '../utils/mime';
import { logger } from '../utils/logger';
import { generateHMAC } from '../utils/hmac';

export const handleImageRequest = async (c: Context<AppEnvironment>) => {
  const reqUrl = new URL(c.req.url);
  // Normalize path
  let path = reqUrl.pathname.replace(/^\/+/, '');
  
  // 1. Handle root path
  if (!path) {
    const title = c.env.APP_TITLE || 'Private Picbed';
    const desc = c.env.APP_DESCRIPTION || 'Ready to serve images.';
    return c.html(`
      <html>
        <head><title>${title}</title></head>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <h1>🖼️ ${title}</h1>
            <p>${desc}</p>
          </div>
        </body>
      </html>
    `);
  }

  if (path.includes('..')) {
    return c.text('Bad Request', 400);
  }

  // 2. Check for Internal Loopback (to bypass resizing proxy header loss)
  const isInternal = reqUrl.searchParams.get('__internal_loopback') === 'true';
  const internalSig = reqUrl.searchParams.get('__sig');

  if (isInternal && internalSig) {
    // Verify internal signature to prevent abuse
    const expectedSig = await generateHMAC(path, c.env.SIGN_SECRET);
    if (internalSig === expectedSig) {
      const repo = await resolveForRead(path, c.env);
      const resp = await fetchFromGitHub(path, repo);
      const newResp = new Response(resp.body, resp);
      newResp.headers.set('Content-Type', getMimeType(path));
      newResp.headers.delete('Content-Disposition');
      return newResp;
    }
  }

  // 3. Normal Request Logic
  const width = reqUrl.searchParams.get('w');
  const height = reqUrl.searchParams.get('h');
  const quality = reqUrl.searchParams.get('q');
  const fit = reqUrl.searchParams.get('fit') as any;
  const isImage = /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(path);

  // Determine cache key
  const cacheKey = new Request(reqUrl.toString(), { method: 'GET' });
  const cache = caches.default;

  const startTime = Date.now();

  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      logger.info('cache_hit', { path, ms: Date.now() - startTime });
      const newResponse = new Response(cachedResponse.body, cachedResponse);
      newResponse.headers.set('X-Cache', 'HIT');
      return newResponse;
    }

    let finalResponse: Response;

    // 4. If resizing is needed for a PRIVATE repo, we must use a loopback URL
    if (isImage && (width || height || quality || fit)) {
      const sig = await generateHMAC(path, c.env.SIGN_SECRET);
      const loopbackUrl = new URL(c.req.url);
      loopbackUrl.search = ''; // Clear original params
      loopbackUrl.searchParams.set('__internal_loopback', 'true');
      loopbackUrl.searchParams.set('__sig', sig);

      const cfOptions: RequestInitCfProperties = {
        image: {
          width: width ? parseInt(width, 10) : undefined,
          height: height ? parseInt(height, 10) : undefined,
          quality: quality ? parseInt(quality, 10) : undefined,
          fit: fit || 'cover',
          format: 'auto' as any,
        }
      };

      // Fetch "self" - the resizing proxy will now call our Worker back
      finalResponse = await fetch(loopbackUrl.toString(), { 
        headers: { 'Referer': c.req.url },
        cf: cfOptions 
      });
      
      // If loopback fails (e.g. 415/400 because plan doesn't support it), fallback to original
      if (finalResponse.status === 415 || finalResponse.status === 400) {
        const repo = await resolveForRead(path, c.env);
        finalResponse = await fetchFromGitHub(path, repo);
      }
    } else {
      const repo = await resolveForRead(path, c.env);
      finalResponse = await fetchFromGitHub(path, repo);
    }

    // 5. Handle errors and caching strategies
    const status = finalResponse.status;
    let ttl = 0;

    if (status === 200) {
      ttl = parseInt(c.env.CACHE_TTL_SECONDS || '604800', 10);
    } else if (status === 404) {
      ttl = 60;
    } else if (status === 401 || status === 403) {
      return c.text('Forbidden: Origin Access Denied', 403);
    } else if (status >= 500) {
      return c.text('Bad Gateway: Origin Server Error', 502);
    }

    // Prepare new response with appropriate headers
    const body = [200, 404].includes(status) ? finalResponse.body : `${status} Error from Origin`;
    const responseHeaders = new Headers(finalResponse.headers);
    
    // --- THOROUGH DE-IDENTIFICATION ---
    // Remove all traces of GitHub and server info
    responseHeaders.delete('Server');
    responseHeaders.delete('Set-Cookie');
    responseHeaders.delete('Content-Disposition');
    responseHeaders.delete('Link');
    responseHeaders.delete('X-Powered-By');
    
    // Loop through and delete all GitHub specific headers
    const headersToDelete: string[] = [];
    responseHeaders.forEach((_, key) => {
      if (key.toLowerCase().startsWith('x-github-') || key.toLowerCase().startsWith('access-control-')) {
        headersToDelete.push(key);
      }
    });
    headersToDelete.forEach(key => responseHeaders.delete(key));

    if (status === 200) {
      const detectedMime = getMimeType(path);
      const currentType = responseHeaders.get('Content-Type');
      if (!currentType || currentType.includes('application/vnd.github') || currentType === 'application/octet-stream') {
        responseHeaders.set('Content-Type', detectedMime);
      }
      responseHeaders.set('Vary', 'Accept');
    } else if (status === 404) {
      responseHeaders.set('Content-Type', 'text/plain');
    }
    
    if (ttl > 0) {
      responseHeaders.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}, immutable`);
    }
    
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Cache', 'MISS');

    const outputResponse = new Response(body, {
      status: status === 200 ? 200 : status,
      headers: responseHeaders
    });

    if (ttl > 0) {
      c.executionCtx.waitUntil(cache.put(cacheKey, outputResponse.clone()));
    }

    logger.info('request_done', { path, status, ms: Date.now() - startTime });
    return outputResponse;

  } catch (error: any) {
    logger.error('internal_error', { path, error: error.message });
    return c.text('Internal Server Error', 500);
  }
};
