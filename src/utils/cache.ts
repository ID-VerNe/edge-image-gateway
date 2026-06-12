import { Bindings } from '../types/env';

/**
 * Tracks cached variants of a file to enable granular purging.
 * Stores a set of full URLs in KV under 'variants::path'.
 */
// Disabled: Rely on D1 only, no KV writes for variants
export const recordCacheVariant = async (path: string, url: string, env: Bindings) => {
  // NOOP: D1-only mode
};

export const purgeFileCache = async (path: string, env: Bindings, origin: string) => {
  const cache = caches.default;
  try {
    const baseUrl = `${origin}/${path}`;
    await cache.delete(new Request(baseUrl));
    console.log(`Cache purged for: ${path}`);
  } catch (err) {
    console.error('Failed to purge file cache:', err);
  }
};
