import { Bindings } from '../types/env';

/**
 * Records a cached image variant URL for future granular purge.
 * Stores the mapping in the dedicated cache_variants table.
 */
// @lat: [[cache]]
export const recordCacheVariant = async (path: string, url: string, env: Bindings) => {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO cache_variants (path, variant_url) VALUES (?, ?) ON CONFLICT(path, variant_url) DO NOTHING`
    ).bind(path, url).run();
  } catch (e) {
    // Best-effort
  }
};

/**
 * Purge all cached variants of a file:
 * 1. Base URL from Edge Cache
 * 2. All known variant URLs from Edge Cache (queried from D1)
 * 3. All R2 objects with the path prefix
 */
// @lat: [[cache#Granular Purge]]
export const purgeFileCache = async (path: string, env: Bindings, origin: string) => {
  const cache = caches.default;

  // 1. Purge base URL from edge cache
  try {
    const baseUrl = `${origin}/${path}`;
    await cache.delete(new Request(baseUrl));
  } catch (err) {
    console.error('Failed to purge base edge cache:', err);
  }

  // 2. Query all known variant URLs from D1 and purge each one
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT variant_url FROM cache_variants WHERE path = ?`
      ).bind(path).all();
      for (const row of results as any[]) {
        try {
          await cache.delete(new Request(row.variant_url));
        } catch { /* best-effort */ }
      }
      // Clean up D1 records
      await env.DB.prepare(`DELETE FROM cache_variants WHERE path = ?`).bind(path).run();
    } catch (err) {
      console.error('Failed to purge variants from D1:', err);
    }
  }

  // 3. Delete from R2 by prefix (all stored variants)
  if (env.CACHE_BUCKET) {
    const r2Prefix = `v2/${path}?`;
    try {
      const objects = await env.CACHE_BUCKET.list({ prefix: r2Prefix });
      if (objects.objects.length > 0) {
        await env.CACHE_BUCKET.delete(objects.objects.map(o => o.key));
      }
      const v1Prefix = `v1/${path}?`;
      try {
        const v1Objects = await env.CACHE_BUCKET.list({ prefix: v1Prefix });
        if (v1Objects.objects.length > 0) {
          await env.CACHE_BUCKET.delete(v1Objects.objects.map(o => o.key));
        }
      } catch { /* best-effort cleanup of old v1 keys */ }
      const baseKey = `v2/${path}`;
      try {
        await env.CACHE_BUCKET.delete(baseKey);
      } catch { /* best-effort */ }
      const v1BaseKey = `v1/${path}`;
      try {
        await env.CACHE_BUCKET.delete(v1BaseKey);
      } catch { /* best-effort */ }
    } catch (err) {
      console.error('Failed to purge R2 variants:', err);
    }
  }
};
