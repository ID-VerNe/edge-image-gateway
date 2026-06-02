import { Bindings } from '../types/env';

/**
 * Tracks cached variants of a file to enable granular purging.
 * Stores a set of full URLs in KV under 'variants::path'.
 */
export const recordCacheVariant = async (path: string, url: string, env: Bindings) => {
  if (!env.REPO_REGISTRY) return;
  try {
    const key = `variants::${path}`;
    const variantsStr = await env.REPO_REGISTRY.get(key);
    let variants: string[] = variantsStr ? JSON.parse(variantsStr) : [];
    
    if (!variants.includes(url)) {
      variants.push(url);
      // Limit to 50 variants per file to avoid KV bloat
      if (variants.length > 50) variants.shift();
      await env.REPO_REGISTRY.put(key, JSON.stringify(variants), { expirationTtl: 604800 * 2 }); // 14 days
    }
  } catch (err) {
    console.error('Failed to record cache variant:', err);
  }
};

/**
 * Purges all cached versions of a file, including all recorded resizing variants.
 */
export const purgeFileCache = async (path: string, env: Bindings, origin: string) => {
  const cache = caches.default;
  try {
    // 1. Purge base URL
    const baseUrl = `${origin}/${path}`;
    await cache.delete(new Request(baseUrl));
    
    // 2. Purge variants from KV registry
    if (env.REPO_REGISTRY) {
      const key = `variants::${path}`;
      const variantsStr = await env.REPO_REGISTRY.get(key);
      if (variantsStr) {
        const variants: string[] = JSON.parse(variantsStr);
        for (const variantUrl of variants) {
          await cache.delete(new Request(variantUrl));
        }
        await env.REPO_REGISTRY.delete(key);
      }
    }
    
    console.log(`Cache purged for: ${path}`);
  } catch (err) {
    console.error('Failed to purge file cache:', err);
  }
};
