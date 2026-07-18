/**
 * Server-side utilities for safe HTML / JS string interpolation.
 * Use in admin.ts, partials.ts, and all admin script template generators.
 */

/**
 * Escape a string for safe insertion into HTML text content or attributes.
 * Converts & " ' < > to their HTML entities.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Encode a string value for safe interpolation into a JavaScript string literal
 * that lives inside a **single-quoted** HTML attribute.
 *
 * Uses encodeURIComponent so the output contains only safe ASCII characters,
 * with no quotes, backslashes, or HTML-special bytes. The receiving JS
 * function must call decodeURIComponent on the argument.
 */
export function encodeJsAttr(str: string): string {
  return encodeURIComponent(str);
}

/**
 * Encode a JSON-serializable value for safe use inside an inline JS context.
 * Returns a string ready for direct interpolation (no extra quotes needed).
 * The receiving side must JSON.parse + decodeURIComponent.
 */
export function encodeJsAttrJson(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}