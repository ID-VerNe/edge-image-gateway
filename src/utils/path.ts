/**
 * Unified path normalization for all middleware and routes.
 * Ensures consistent handling of URL paths across the application.
 */

/**
 * Normalize a URL path string:
 * 1. Reject null bytes and control characters
 * 2. Double-decode to catch double-encoded path traversal (e.g. %252e%252e -> ..)
 * 3. Convert backslashes to forward slashes (Windows-style path normalization)
 * 4. Ensure leading slash
 * 5. Strip trailing slash (except for root '/')
 * 6. Collapse repeated slashes
 * 7. Reject path traversal sequences ('..')
 *
 * Returns the normalized path, or null if the path is invalid.
 */
// @lat: [[path]]
export function normalizePath(rawPath: string): string | null {
  if (!rawPath) return '/';

  if (rawPath.includes('\0') || /[\x00-\x1f]/.test(rawPath)) return null;

  let path: string = rawPath;

  try {
    let decoded = decodeURIComponent(path);
    while (decoded !== path) {
      path = decoded;
      try { decoded = decodeURIComponent(path); } catch { break; }
    }
  } catch {
    // Use partially decoded path
  }

  path = path.replace(/\\/g, '/');

  if (!path.startsWith('/')) path = '/' + path;

  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);

  path = path.replace(/\/+/g, '/');

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
