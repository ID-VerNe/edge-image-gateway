/**
 * Resize convolvers — pure JS, fixed-point integer arithmetic.
 *
 * Extracted from pica (nodeca/pica) `src/mm_resize/convolve.ts`.
 * Two-pass separable convolution (horizontal then vertical, transposed).
 * License: MIT.
 */

type SrcBuffer = Uint8Array | Uint8ClampedArray;

function clampTo8(i: number): number {
  return i < 0 ? 0 : i > 255 ? 255 : i;
}
function clampNegative(i: number): number {
  return i >= 0 ? i : 0;
}

/**
 * Convolve horizontally (no alpha premultiply). Output is transposed into
 * a Uint16Array carrying 15-bit intermediate values.
 */
export function convolveHor(
  src: SrcBuffer,
  dest: Uint16Array,
  srcW: number,
  srcH: number,
  destW: number,
  filters: Int16Array,
): void {
  let r: number, g: number, b: number, a: number;
  let filterPtr: number, filterShift: number, filterSize: number;
  let srcPtr: number, srcY: number, destX: number, filterVal: number;
  let srcOffset = 0, destOffset = 0;

  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr = 0;
    for (destX = 0; destX < destW; destX++) {
      filterShift = filters[filterPtr++];
      filterSize = filters[filterPtr++];
      srcPtr = (srcOffset + filterShift * 4) | 0;

      r = g = b = a = 0;
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        // reverse order (v8 deopt workaround preserved from pica)
        a = (a + filterVal * src[srcPtr + 3]) | 0;
        b = (b + filterVal * src[srcPtr + 2]) | 0;
        g = (g + filterVal * src[srcPtr + 1]) | 0;
        r = (r + filterVal * src[srcPtr]) | 0;
        srcPtr = (srcPtr + 4) | 0;
      }

      dest[destOffset + 3] = clampNegative(a >> 7);
      dest[destOffset + 2] = clampNegative(b >> 7);
      dest[destOffset + 1] = clampNegative(g >> 7);
      dest[destOffset] = clampNegative(r >> 7);
      destOffset = (destOffset + srcH * 4) | 0;
    }
    destOffset = ((srcY + 1) * 4) | 0;
    srcOffset = ((srcY + 1) * srcW * 4) | 0;
  }
}

/** Vertical pass. Reads transposed Uint16, writes RGBA Uint8. */
export function convolveVert(
  src: Uint16Array,
  dest: Uint8Array,
  srcW: number,
  srcH: number,
  destW: number,
  filters: Int16Array,
): void {
  let r: number, g: number, b: number, a: number;
  let filterPtr: number, filterShift: number, filterSize: number;
  let srcPtr: number, srcY: number, destX: number, filterVal: number;
  let srcOffset = 0, destOffset = 0;

  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr = 0;
    for (destX = 0; destX < destW; destX++) {
      filterShift = filters[filterPtr++];
      filterSize = filters[filterPtr++];
      srcPtr = (srcOffset + filterShift * 4) | 0;

      r = g = b = a = 0;
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        a = (a + filterVal * src[srcPtr + 3]) | 0;
        b = (b + filterVal * src[srcPtr + 2]) | 0;
        g = (g + filterVal * src[srcPtr + 1]) | 0;
        r = (r + filterVal * src[srcPtr]) | 0;
        srcPtr = (srcPtr + 4) | 0;
      }

      r >>= 7; g >>= 7; b >>= 7; a >>= 7;

      dest[destOffset + 3] = clampTo8((a + (1 << 13)) >> 14);
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14);
      dest[destOffset] = clampTo8((r + (1 << 13)) >> 14);
      destOffset = (destOffset + srcH * 4) | 0;
    }
    destOffset = ((srcY + 1) * 4) | 0;
    srcOffset = ((srcY + 1) * srcW * 4) | 0;
  }
}

/** Horizontal pass with premultiplication for images that carry alpha. */
export function convolveHorWithPre(
  src: SrcBuffer,
  dest: Uint16Array,
  srcW: number,
  srcH: number,
  destW: number,
  filters: Int16Array,
): void {
  let r: number, g: number, b: number, a: number, alpha: number;
  let filterPtr: number, filterShift: number, filterSize: number;
  let srcPtr: number, srcY: number, destX: number, filterVal: number;
  let srcOffset = 0, destOffset = 0;

  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr = 0;
    for (destX = 0; destX < destW; destX++) {
      filterShift = filters[filterPtr++];
      filterSize = filters[filterPtr++];
      srcPtr = (srcOffset + filterShift * 4) | 0;

      r = g = b = a = 0;
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        alpha = src[srcPtr + 3];
        a = (a + filterVal * alpha) | 0;
        b = (b + filterVal * src[srcPtr + 2] * alpha) | 0;
        g = (g + filterVal * src[srcPtr + 1] * alpha) | 0;
        r = (r + filterVal * src[srcPtr] * alpha) | 0;
        srcPtr = (srcPtr + 4) | 0;
      }

      // Premultiply is (* alpha / 255). Postpone division.
      b = (b / 255) | 0;
      g = (g / 255) | 0;
      r = (r / 255) | 0;

      dest[destOffset + 3] = clampNegative(a >> 7);
      dest[destOffset + 2] = clampNegative(b >> 7);
      dest[destOffset + 1] = clampNegative(g >> 7);
      dest[destOffset] = clampNegative(r >> 7);
      destOffset = (destOffset + srcH * 4) | 0;
    }
    destOffset = ((srcY + 1) * 4) | 0;
    srcOffset = ((srcY + 1) * srcW * 4) | 0;
  }
}

/** Vertical pass with un-premultiply. */
export function convolveVertWithPre(
  src: Uint16Array,
  dest: Uint8Array,
  srcW: number,
  srcH: number,
  destW: number,
  filters: Int16Array,
): void {
  let r: number, g: number, b: number, a: number;
  let filterPtr: number, filterShift: number, filterSize: number;
  let srcPtr: number, srcY: number, destX: number, filterVal: number;
  let srcOffset = 0, destOffset = 0;

  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr = 0;
    for (destX = 0; destX < destW; destX++) {
      filterShift = filters[filterPtr++];
      filterSize = filters[filterPtr++];
      srcPtr = (srcOffset + filterShift * 4) | 0;

      r = g = b = a = 0;
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        a = (a + filterVal * src[srcPtr + 3]) | 0;
        b = (b + filterVal * src[srcPtr + 2]) | 0;
        g = (g + filterVal * src[srcPtr + 1]) | 0;
        r = (r + filterVal * src[srcPtr]) | 0;
        srcPtr = (srcPtr + 4) | 0;
      }

      r >>= 7; g >>= 7; b >>= 7; a >>= 7;

      // Un-premultiply
      a = clampTo8((a + (1 << 13)) >> 14);
      if (a > 0) {
        r = (r * 255 / a) | 0;
        g = (g * 255 / a) | 0;
        b = (b * 255 / a) | 0;
      }

      dest[destOffset + 3] = a;
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14);
      dest[destOffset] = clampTo8((r + (1 << 13)) >> 14);
      destOffset = (destOffset + srcH * 4) | 0;
    }
    destOffset = ((srcY + 1) * 4) | 0;
    srcOffset = ((srcY + 1) * srcW * 4) | 0;
  }
}
