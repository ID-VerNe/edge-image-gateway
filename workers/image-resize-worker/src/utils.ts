/**
 * Utilities: magic-byte detection + dimension/fit math.
 *
 * Memory budget (workerd, 128MB): the hard cap is driven by decode-time
 * RGBA footprint = width × height × 4 bytes. 24MP → 96MB, which plus
 * the input buffer and resize intermediates sits ~120MB — already
 * uncomfortably close to the limit. Going higher (40MP+ = 160MB+)
 * will OOM at decode, so the cap is physics-bounded, not arbitrary.
 */
import type { InputFormat, FitMode } from './types';

// 24MP total — fits 4K×6K camera output. Peak RGBA = 96MB.
// DO NOT raise total above ~26MP without tiling or a WASM decoder.
const MAX_INPUT_PIXELS = 24_000_000;
// Allow long-edge up to 8000 (covers 4000×6000 and 6000×4000).
const MAX_DIM = 8000;

/** Detect image format from magic bytes; returns null if unknown. */
export function detectFormat(bytes: Uint8Array): InputFormat | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';
  return null;
}

export class ResizeValidationError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
    this.name = 'ResizeValidationError';
  }
}

/**
 * Compute target dimensions honoring fit mode + aspect ratio.
 * Returns integer dims >= 1.
 */
export function computeTarget(
  srcW: number,
  srcH: number,
  targetW: number | undefined,
  targetH: number | undefined,
  fit: FitMode,
): { w: number; h: number } {
  if (!targetW && !targetH) {
    throw new ResizeValidationError('width or height required', 422);
  }
  if (srcW <= 0 || srcH <= 0) {
    throw new ResizeValidationError('invalid source dimensions', 422);
  }
  const aspect = srcW / srcH;

  let w = targetW ?? 0;
  let h = targetH ?? 0;

  switch (fit) {
    case 'cover': {
      if (w === 0) w = Math.round(h * aspect);
      if (h === 0) h = Math.round(w / aspect);
      // cover: fill both, crop overflow — but since we don't crop here,
      // behave like 'inside' when only one dim is given; both given → scale to cover.
      if (targetW && targetH) {
        const scale = Math.max(targetW / srcW, targetH / srcH);
        w = Math.max(1, Math.round(srcW * scale));
        h = Math.max(1, Math.round(srcH * scale));
      }
      break;
    }
    case 'contain':
    case 'inside': {
      if (w === 0) w = Math.round(h * aspect);
      if (h === 0) h = Math.round(w / aspect);
      if (targetW && targetH) {
        const scale = Math.min(targetW / srcW, targetH / srcH);
        w = Math.max(1, Math.round(srcW * scale));
        h = Math.max(1, Math.round(srcH * scale));
      }
      break;
    }
    case 'fill': {
      w = w || Math.round((h || 1) * aspect);
      h = h || Math.round(w / aspect);
      break;
    }
    default:
      throw new ResizeValidationError(`unsupported fit: ${fit}`, 422);
  }

  if (w < 1 || h < 1) throw new ResizeValidationError('target dimensions must be >= 1', 422);
  if (w > MAX_DIM || h > MAX_DIM) throw new ResizeValidationError(`target exceeds ${MAX_DIM}px`, 422);
  return { w, h };
}

export function assertInputWithinBounds(width: number, height: number): void {
  if (width > MAX_DIM || height > MAX_DIM || width * height > MAX_INPUT_PIXELS) {
    throw new ResizeValidationError(
      `input image too large: ${width}x${height} (max ${MAX_DIM}px / ${MAX_INPUT_PIXELS}px)`,
      413,
    );
  }
}

/** Normalize an incoming payload to a Uint8Array view (no copy if already Uint8Array). */
export function toBytes(input: ArrayBuffer | Uint8Array | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  // ArrayBufferView
  const view = input as ArrayBufferView;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}
