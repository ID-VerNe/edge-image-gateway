import { Bindings } from '../types/env';

/**
 * R2 Cache Service for Image Variations
 * Purpose: Store processed images to save GitHub API quota and improve performance.
 */
// @lat: [[r2Cache]]
const ALLOWED_TRANSFORM_PARAMS = new Set(['w', 'h', 'q', 'fit']);

export const r2Cache = {
  generateKey(path: string, params: URLSearchParams): string {
    const parts: string[] = [];
    for (const k of ALLOWED_TRANSFORM_PARAMS) {
      const v = params.get(k);
      if (v !== null) {
        parts.push(`${k}=${v}`);
      }
    }
    parts.sort();
    const queryStr = parts.length > 0 ? `?${parts.join('&')}` : '';
    return `v2/${path}${queryStr}`;
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
