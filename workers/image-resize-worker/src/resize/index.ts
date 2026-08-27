/**
 * Resize orchestrator — single-pass (no tiling) variant.
 *
 * Adapted from pica (nodeca/pica) `src/mm_resize/resize.ts`. Pica's
 * production path tiles the image for parallelism + WASM; here we keep
 * the pure-JS convolve path only and operate on the full frame at once.
 *
 * Memory note: a single-pass resize allocates one intermediate Uint16Array
 * of `destW * srcH * 4`. For a 4000x3000 → 400x300 resize that's
 * ~19MB, well within the 128MB Worker limit. The tiling machinery from
 * pica is dropped to keep the extracted code self-contained.
 *
 * Unsharp mask: applied only when `unsharpAmount` is set. The caller
 * (index.ts) suppresses unsharp for targets >8MP to avoid the extra
 * 16-bit buffer OOM. This function still honours the flag if passed.
 *
 * License: MIT.
 */
import { createFilters } from './filter_gen';
import type { FilterName } from './filter_info';
import { convolveHor, convolveVert, convolveHorWithPre, convolveVertWithPre } from './convolve';
import { unsharp } from './unsharp';

export interface ResizeOptions {
  src: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  toWidth: number;
  toHeight: number;
  filter?: FilterName;
  unsharpAmount?: number;
  unsharpRadius?: number;
  unsharpThreshold?: number;
  dest?: Uint8Array;
}

function hasAlpha(src: Uint8Array | Uint8ClampedArray, width: number, height: number): boolean {
  let ptr = 3;
  const len = (width * height * 4) | 0;
  while (ptr < len) {
    if (src[ptr] !== 255) return true;
    ptr = (ptr + 4) | 0;
  }
  return false;
}

function resetAlpha(dst: Uint8Array, width: number, height: number): void {
  let ptr = 3;
  const len = (width * height * 4) | 0;
  while (ptr < len) {
    dst[ptr] = 0xff;
    ptr = (ptr + 4) | 0;
  }
}

export function resize(options: ResizeOptions): Uint8Array {
  const src = options.src;
  const srcW = options.width;
  const srcH = options.height;
  const destW = options.toWidth;
  const destH = options.toHeight;
  const dest = options.dest || new Uint8Array(destW * destH * 4);

  const filter: FilterName = options.filter ?? 'lanczos3';
  const scaleX = destW / srcW;
  const scaleY = destH / srcH;

  const filtersX = createFilters(filter, srcW, destW, scaleX, 0);
  const filtersY = createFilters(filter, srcH, destH, scaleY, 0);

  const tmp = new Uint16Array(destW * srcH * 4);

  if (hasAlpha(src, srcW, srcH)) {
    convolveHorWithPre(src, tmp, srcW, srcH, destW, filtersX);
    convolveVertWithPre(tmp, dest, srcH, destW, destH, filtersY);
  } else {
    convolveHor(src, tmp, srcW, srcH, destW, filtersX);
    convolveVert(tmp, dest, srcH, destW, destH, filtersY);
    resetAlpha(dest, destW, destH);
  }

  if (options.unsharpAmount) {
    unsharp(
      dest,
      destW,
      destH,
      options.unsharpAmount,
      options.unsharpRadius ?? 0.6,
      options.unsharpThreshold ?? 0,
    );
  }

  return dest;
}
