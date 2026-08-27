/**
 * WASM codec module — direct emscripten / wasm-bindgen wrappers.
 *
 * Cloudflare Workers do not support dynamic `import()`, so the WASM binaries
 * are statically imported at the top of the file (wrangler's ESM `.wasm` rule
 * exposes each as a ready `WebAssembly.Module`). Each codec's init function
 * accepts that module and instantiates synchronously — no runtime fetch.
 *
 * The @jsquash wrapper layers (@jsquash/jpeg/decode.js, @jsquash/png/decode.js)
 * use `wasm-feature-detect` and dynamic import patterns that are incompatible
 * with workerd. We bypass them by calling the underlying module factories
 * directly.
 *
 * - mozjpeg (JPEG decode): emscripten module factory, uses `initEmscriptenModule`
 * - squoosh_png (PNG decode): wasm-bindgen module, uses `initSync()` + exports
 *
 * Replaces jpeg-js (peak ~400MB at 24MP → OOM 503/1102) with mozjpeg WASM,
 * which emits a single RGBA buffer (96MB @ 24MP) and stays under the 128MB
 * workerd wall. See .plan/resize-worker-wasm-decode.md.
 *
 * WebP encode is handled separately in encode/webp.ts (same pattern).
 *
 * Licenses: mozjpeg BSD-3, rust-png MIT/Apache-2.0.
 */
import type { DecodedImage } from './types';
import { ResizeValidationError } from './utils';

// --- JPEG decoder (mozjpeg — emscripten module factory) ---

import mozjpegDecFactory from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js';
import JPEG_DEC_WASM from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';

let jpegModulePromise: Promise<any> | null = null;

function initEmscriptenModule(
  moduleFactory: (opts: Record<string, unknown>) => unknown,
  wasmModule: WebAssembly.Module,
): Promise<unknown> {
  const instantiateWasm = (
    imports: WebAssembly.Imports,
    callback: (instance: WebAssembly.Instance) => void,
  ): WebAssembly.Exports => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    callback(instance);
    return instance.exports;
  };
  return Promise.resolve(moduleFactory({ noInitialRun: true, instantiateWasm }));
}

async function ensureJpegDecInit(): Promise<void> {
  if (!jpegModulePromise) {
    jpegModulePromise = initEmscriptenModule(
      mozjpegDecFactory as (opts: Record<string, unknown>) => unknown,
      JPEG_DEC_WASM as unknown as WebAssembly.Module,
    );
  }
  await jpegModulePromise;
}

export async function decodeJpeg(bytes: Uint8Array): Promise<DecodedImage> {
  await ensureJpegDecInit();
  const mod = await jpegModulePromise;
  if (!mod) throw new ResizeValidationError('jpeg decoder not initialised', 500);

  let img;
  try {
    img = mod.decode(bytes, false);
  } catch (e: any) {
    throw new ResizeValidationError(`jpeg decode failed: ${e?.message || String(e)}`, 422);
  }

  if (!img || !img.width || !img.height || !img.data) {
    throw new ResizeValidationError('jpeg decode returned empty image', 422);
  }

  // Uint8ClampedArray → Uint8Array view over the same buffer (zero-copy).
  return {
    data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    width: img.width,
    height: img.height,
  };
}

// --- PNG decoder (squoosh_png — wasm-bindgen module) ---

import { decode as pngDecode, initSync as pngInitSync } from '@jsquash/png/codec/pkg/squoosh_png.js';
// @ts-expect-error — wasm-bindgen sidecar .d.ts has named exports only,
// but wrangler emits a default WebAssembly.Module at runtime.
import PNG_DEC_WASM from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

let pngInited = false;

async function ensurePngDecInit(): Promise<void> {
  if (!pngInited) {
    pngInitSync(PNG_DEC_WASM as unknown as WebAssembly.Module);
    pngInited = true;
  }
}

export async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  await ensurePngDecInit();

  let img;
  try {
    img = pngDecode(bytes) as any;
  } catch (e: any) {
    throw new ResizeValidationError(`png decode failed: ${e?.message || String(e)}`, 422);
  }

  if (!img || !img.width || !img.height || !img.data) {
    throw new ResizeValidationError('png decode returned empty image', 422);
  }

  return {
    data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    width: img.width,
    height: img.height,
  };
}