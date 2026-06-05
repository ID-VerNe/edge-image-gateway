import { Bindings } from '../types/env';

/**
 * R2 Cache Service for Image Variations
 * Purpose: Store processed images to save GitHub API quota and improve performance.
 */
export const r2Cache = {
  /**
   * Generates a deterministic R2 key for a given path and transformation parameters.
   */
  generateKey(path: string, params: URLSearchParams): string {
    // 1. Sort parameters to ensure stable keys (w=100&h=100 vs h=100&w=100)
    const sortedKeys = Array.from(params.keys()).sort();
    const parts = sortedKeys.map(k => `${k}=${params.get(k)}`);
    
    // 2. Prefix with path and join with params
    // Format: "v1/path/to/img.jpg?fit=cover&h=100&w=100"
    // We use a version prefix for easy migration if we change the format
    const queryStr = parts.length > 0 ? `?${parts.join('&')}` : '';
    return `v1/${path}${queryStr}`;
  },

  /**
   * Tries to retrieve a variation from R2.
   */
  async get(env: Bindings, key: string): Promise<R2ObjectBody | null> {
    if (!env.CACHE_BUCKET) return null;
    try {
      return await env.CACHE_BUCKET.get(key);
    } catch (e) {
      console.error('R2 Cache Get Error:', e);
      return null;
    }
  },

  /**
   * Saves a processed variation to R2.
   */
  async put(env: Bindings, key: string, body: ReadableStream | ArrayBuffer | string, contentType: string) {
    if (!env.CACHE_BUCKET) return;
    try {
      await env.CACHE_BUCKET.put(key, body, {
        httpMetadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=604800, immutable',
        },
        // Optional: custom metadata
        customMetadata: {
          cachedAt: new Date().toISOString()
        }
      });
    } catch (e) {
      console.error('R2 Cache Put Error:', e);
    }
  }
};
