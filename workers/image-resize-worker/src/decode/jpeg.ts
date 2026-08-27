/**
 * JPEG decoder wrapper — direct emscripten module factory.
 *
 * The @jsquash/jpeg/decode.js wrapper uses dynamic `import()` patterns
 * incompatible with workerd. We call the mozjpeg emscripten factory
 * directly from wasm.ts.
 *
 * Replaces jpeg-js, whose per-channel work buffer + RGBA output peaked
 * ~400MB on a 24MP image and hit the workerd 128MB wall (503/1102).
 * mozjpeg WASM emits a single RGBA buffer (96MB @ 24MP) and stays in
 * budget. See .plan/resize-worker-wasm-decode.md.
 */
import { decodeJpeg } from '../wasm';
import type { DecodedImage } from '../types';
import { ResizeValidationError } from '../utils';

export async function decodeJpegImage(bytes: Uint8Array): Promise<DecodedImage> {
  try {
    return await decodeJpeg(bytes);
  } catch (e: any) {
    if (e instanceof ResizeValidationError) throw e;
    throw new ResizeValidationError(`jpeg decode failed: ${e?.message || String(e)}`, 422);
  }
}