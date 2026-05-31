import { Context } from 'hono';
import { AppEnvironment } from '../types/env';
import { fetchFromGitHub } from '../services/github';
import { getMimeType } from '../utils/mime';
import { logger } from '../utils/logger';

export const handleImageRequest = async (c: Context<AppEnvironment>) => {
  const reqUrl = new URL(c.req.url);
  // Normalize path: remove leading slashes, avoid directory traversal
  let path = reqUrl.pathname.replace(/^\/+/, '');
  if (path.includes('..')) {
    return c.text('Bad Request', 400);
  }

  // Parse image transformation parameters
  const width = reqUrl.searchParams.get('w');
  const height = reqUrl.searchParams.get('h');
  const quality = reqUrl.searchParams.get('q');
  const fit = reqUrl.searchParams.get('fit') as any;
  const isImage = /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(path);

  // Determine cache key - must include query params if transformation is applied
  const cacheKey = new Request(reqUrl.toString(), { method: 'GET' });
  const cache = caches.default;

  const startTime = Date.now();

  try {
    // 1. Try to get from Cache
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      logger.info('cache_hit', { path, ms: Date.now() - startTime });
      const newResponse = new Response(cachedResponse.body, cachedResponse);
      newResponse.headers.set('X-Cache', 'HIT');
      return newResponse;
    }

    // Prepare Cloudflare transformation options
    let cfOptions: RequestInitCfProperties | undefined = undefined;
    if (isImage && (width || height || quality || fit)) {
      cfOptions = {
        image: {
          width: width ? parseInt(width, 10) : undefined,
          height: height ? parseInt(height, 10) : undefined,
          quality: quality ? parseInt(quality, 10) : undefined,
          fit: fit || 'cover',
          format: 'auto', // Format negotiation
        }
      };
    }

    // 2. Fetch from Origin (GitHub)
    const githubResponse = await fetchFromGitHub(path, c.env, cfOptions);
    
    // 3. Handle errors and caching strategies
    const status = githubResponse.status;
    let ttl = 0;

    if (status === 200) {
      ttl = parseInt(c.env.CACHE_TTL_SECONDS || '604800', 10);
    } else if (status === 404) {
      ttl = 60; // Short cache for 404
    } else if (status === 401 || status === 403) {
      logger.error('github_auth_error', { status, path });
      return c.text('Bad Gateway: GitHub Auth Error', 502);
    } else if (status === 429) {
      logger.warn('github_rate_limit', { path });
      return c.text('Service Unavailable: GitHub Rate Limited', 503, { 'Retry-After': '60' });
    } else if (status >= 500) {
      return c.text('Bad Gateway: GitHub Server Error', 502);
    } else if (status === 304) {
      return new Response(null, { status: 304 });
    }

    // Prepare new response with appropriate headers
    const body = [200, 404].includes(status) ? githubResponse.body : `${status} Error from Origin`;
    const responseHeaders = new Headers(githubResponse.headers);
    
    // Clean up headers from GitHub
    responseHeaders.delete('Server');
    responseHeaders.delete('X-GitHub-Request-Id');
    responseHeaders.delete('Access-Control-Allow-Origin');
    responseHeaders.delete('Set-Cookie');

    if (status === 200) {
      // If CF resized it, it might have changed the content-type (e.g. to webp)
      // If it didn't resize, we use our own mapping
      if (!responseHeaders.has('Content-Type')) {
        responseHeaders.set('Content-Type', getMimeType(path));
      }
      responseHeaders.set('Vary', 'Accept'); // Important for format negotiation
    } else if (status === 404) {
      responseHeaders.set('Content-Type', 'text/plain');
    }
    
    if (ttl > 0) {
      responseHeaders.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}, immutable`);
    }
    
    // Security headers
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Referrer-Policy', 'no-referrer');
    responseHeaders.set('X-Cache', 'MISS');

    // Create the final response
    const finalResponse = new Response(body, {
      status: status === 200 ? 200 : status,
      headers: responseHeaders
    });

    // 4. Write back to Cache (if applicable)
    if (ttl > 0) {
      c.executionCtx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    logger.info('cache_miss', { path, status, ms: Date.now() - startTime });
    return finalResponse;

  } catch (error: any) {
    logger.error('internal_error', { path, error: error.message });
    return c.text('Internal Server Error', 500);
  }
};
