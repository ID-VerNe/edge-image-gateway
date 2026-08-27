/**
 * PNG decoder wrapper — direct emscripten module factory.
 *
 * The @jsquash/png/decode.js wrapper uses dynamic `import()` patterns
 * incompatible with workerd. We call the rust-png emscripten factory
 * directly from wasm.ts.
 *
 * Replaces the vendored @upng/upng-js (which had a stripped window.UZIP
 * hack) with a proper WASM decoder. The rust-png WASM emits a single RGBA
 * buffer, fitting the same memory-constrained path as the JPEG decoder.
 */
import { decodePng } from '../wasm';
import type { DecodedImage } from '../types';
import { ResizeValidationError } from '../utils';

export async function decodePngImage(bytes: Uint8Array): Promise<DecodedImage> {
  try {
    return await decodePng(bytes);
  } catch (e: any) {
    if (e instanceof ResizeValidationError) throw e;
    throw new ResizeValidationError(`png decode failed: ${e?.message || String(e)}`, 422);
  }
}