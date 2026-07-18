/**
 * Unified path normalization for all middleware and routes.
 * Ensures consistent handling of URL paths across the application.
 */

/**
 * Normalize a URL path string:
 * 1. URI-decode
 * 2. Ensure leading slash
 * 3. Strip trailing slash (except for root '/')
 * 4. Collapse repeated slashes
 * 5. Reject path traversal sequences ('..')
 *
 * Returns the normalized path, or null if the path is invalid (contains '..').
 */
export function normalizePath(rawPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    path = rawPath; // If decoding fails, use raw
  }

  // Ensure leading slash
  if (!path.startsWith('/')) path = '/' + path;

  // Strip trailing slash (preserve root '/')
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);

  // Collapse repeated slashes (e.g. "//" -> "/")
  path = path.replace(/\/+/g, '/');

  // Reject path traversal
  if (path.includes('..')) return null;

  return path;
}

/**
 * Version used for HMAC signature generation.
 * Same as normalizePath but also ensures the path contains no pipe character,
 * which would conflict with the `path|exp` HMAC message format.
 */
export function normalizePathForHMAC(rawPath: string): string | null {
  const normalized = normalizePath(rawPath);
  if (!normalized) return null;
  if (normalized.includes('|')) return null;
  return normalized;
}