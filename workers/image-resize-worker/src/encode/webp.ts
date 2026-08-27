/**
 * WebP encoder wrapper — direct emscripten module factory.
 *
 * @jsquash/webp/encode.js uses `wasm-feature-detect` + dynamic `import()`
 * to select SIMD vs non-SIMD encoder, which is incompatible with Cloudflare
 * Workers (no dynamic `import()`). This wrapper statically imports the
 * emscripten module factory and the WASM binary, then instantiates via
 * the `initEmscriptenModule` pattern (same as @jsquash/webp/utils.js).
 *
 * SIMD is available in workerd. On instantiation failure (e.g. no SIMD
 * support), falls back to the non-SIMD encoder.
 *
 * After instantiation, module.encode(data, width, height, options)
 * returns a Uint8Array (or null on failure).
 *
 * Replaces @stacksjs/ts-webp (which used Bun.spawn for encodeAsync and
 * a minimal embed for sync encode).
 */
import type { DecodedImage } from '../types';
import { ResizeValidationError } from '../utils';

// Static imports — wrangler ESM .wasm rule exposes each as WebAssembly.Module.
// Bare package specifiers resolve via node_modules at build time.
import webpEncSimdFactory from '@jsquash/webp/codec/enc/webp_enc_simd.js';
import webpEncFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import WEBP_ENC_SIMD_WASM from '@jsquash/webp/codec/enc/webp_enc_simd.wasm';
import WEBP_ENC_WASM from '@jsquash/webp/codec/enc/webp_enc.wasm';

/** Default WebP encode options (from @jsquash/webp/meta.js). */
const DEFAULT_OPTIONS = {
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};

let modulePromise: Promise<any> | null = null;

/**
 * Initialise an emscripten module factory with a pre-compiled WASM Module.
 * Mirrors @jsquash/webp/utils.js's initEmscriptenModule but inline so we
 * don't import the broken encode.js tree (which uses wasm-feature-detect).
 */
function initEmscriptenModule(
  moduleFactory: (opts: Record<string, unknown>) => Promise<unknown>,
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
  // The factory returns Module.ready (a Promise that resolves to the Module).
  return moduleFactory({ noInitialRun: true, instantiateWasm });
}

/**
 * Idempotently initialise the WebP encoder WASM module. Safe to call on
 * every request — the first caller triggers init, subsequent callers await
 * the same promise. Tries SIMD first, falls back to non-SIMD.
 */
export async function ensureWebpEncInit(): Promise<void> {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        return await initEmscriptenModule(
          webpEncSimdFactory as unknown as (opts: Record<string, unknown>) => Promise<unknown>,
          WEBP_ENC_SIMD_WASM as unknown as WebAssembly.Module,
        );
      } catch {
        try {
          return await initEmscriptenModule(
            webpEncFactory as unknown as (opts: Record<string, unknown>) => Promise<unknown>,
            WEBP_ENC_WASM as unknown as WebAssembly.Module,
          );
        } catch (e: any) {
          throw new Error(`webp encoder init failed: ${e?.message || String(e)}`);
        }
      }
    })();
  }
  await modulePromise;
}

export interface WebpEncodeOpts {
  quality?: number;
  lossless?: boolean;
}

/**
 * Encode raw RGBA pixel data to WebP. Async — the WASM module is initialised
 * lazily on first call.
 */
export async function encodeWebpImage(
  img: DecodedImage,
  opts: WebpEncodeOpts = {},
): Promise<Uint8Array> {
  await ensureWebpEncInit();

  const mod = await modulePromise;
  if (!mod) throw new Error('webp encoder not initialised');

  const options = { ...DEFAULT_OPTIONS };
  if (opts.quality != null) options.quality = opts.quality;
  if (opts.lossless) {
    options.lossless = 1;
    options.quality = 75;
  }

  const result = mod.encode(img.data, img.width, img.height, options);
  if (!result) {
    throw new ResizeValidationError('webp encode returned null', 422);
  }

  // result is already Uint8Array from emscripten
  return result as Uint8Array;
}