/**
 * image-resize-worker
 *
 * Internal Cloudflare Worker invoked by img-proxy via service binding.
 * Pipeline: decode (WASM: mozjpeg / rust-png) → resize (pica Lanczos3,
 * pure JS) → encode (WASM: libwebp). WASM decoders stay within the
 * 128MB workerd wall even for 24MP (6000×4000) images.
 *
 * Unsharp mask policy: applied only when the target image is ≤8MP
 * (e.g., 3264×2448). For larger targets, unsharp is silently ignored
 * to avoid OOM from the additional 16-bit buffer.
 *
 * POST /resize
 *   body: ArrayBuffer (raw image bytes) OR JSON { image: <base64>, ... }
 *   query / json fields: width, height, quality, fit, filter, lossless,
 *   unsharpAmount, unsharpRadius, unsharpThreshold, format?
 *
 * 200: body = WebP binary
 * 413: input too large
 * 415: unsupported input format
 * 422: invalid params / decode failure
 */
import { Hono } from 'hono';
import type { Env, ResizeRequest, InputFormat, FitMode, ResizeFilter } from './types';
import { detectFormat, toBytes, computeTarget, assertInputWithinBounds, ResizeValidationError } from './utils';
import { decodeJpegImage } from './decode/jpeg';
import { decodePngImage } from './decode/png';
import { resize } from './resize';
import { encodeWebpImage } from './encode/webp';

const app = new Hono<{ Bindings: Env }>();

/** 8 megapixels — threshold above which unsharp mask is skipped. */
const UNSHARP_MAX_PX = 8_000_000;

app.get('/health', (c) => c.text('ok'));

/**
 * Auth gate. If RESIZE_API_KEY is configured, every request (public route
 * AND service-binding call) must carry a matching X-Api-Key header.
 * When unset (local dev), the gate is a no-op so `wrangler dev` works
 * without secrets.
 */
app.use('*', async (c, next) => {
  const expected = c.env.RESIZE_API_KEY;
  if (!expected) return next();
  const provided = c.req.header('x-api-key');
  if (!provided || provided !== expected) {
    return c.json({ error: 'unauthorized' }, 401 as any);
  }
  await next();
});

/** Hono's c.json needs a ContentfulStatusCode; coerce our numeric status. */
function jsonError(c: any, message: string, status: number) {
  return c.json({ error: message }, status as any);
}

app.post('/resize', async (c) => {
  let req: ResizeRequest;
  try {
    req = await parseRequest(c);
  } catch (e: any) {
    return c.json({ error: e?.message || 'bad request' }, (e?.status || 400) as any);
  }

  const bytes = toBytes(req.image as any);

  // 1. Format detection
  const fmt: InputFormat = req.format || detectFormat(bytes) || (() => {
    throw new ResizeValidationError('unsupported input format', 415);
  })();

  // 2. Decode (async — WASM decoders)
  let decoded;
  try {
    if (fmt === 'jpeg') decoded = await decodeJpegImage(bytes);
    else if (fmt === 'png') decoded = await decodePngImage(bytes);
    else throw new ResizeValidationError('unsupported input format', 415);
  } catch (e: any) {
    const status = e instanceof ResizeValidationError ? e.status : 422;
    return jsonError(c, e?.message || 'decode failed', status);
  }

  assertInputWithinBounds(decoded.width, decoded.height);

  // 3. Compute target dims
  const fit: FitMode = (req.fit as FitMode) || 'cover';
  let target;
  try {
    target = computeTarget(decoded.width, decoded.height, req.width, req.height, fit);
  } catch (e: any) {
    const status = e instanceof ResizeValidationError ? e.status : 422;
    return jsonError(c, e?.message || 'invalid target', status);
  }

  // No-op if already at target size — still re-encode to WebP.
  const filter: ResizeFilter = (req.filter as ResizeFilter) || 'lanczos3';
  const targetPx = target.w * target.h;

  // Unsharp policy: ≤8MP target allows, >8MP silently ignored.
  const unsharpAmount = targetPx <= UNSHARP_MAX_PX ? req.unsharpAmount : undefined;

  const resized =
    target.w === decoded.width && target.h === decoded.height
      ? decoded
      : {
          data: resize({
            src: decoded.data,
            width: decoded.width,
            height: decoded.height,
            toWidth: target.w,
            toHeight: target.h,
            filter,
            unsharpAmount,
            unsharpRadius: req.unsharpRadius,
            unsharpThreshold: req.unsharpThreshold,
          }),
          width: target.w,
          height: target.h,
        };

  // 4. Encode (async — WASM WebP encoder)
  let webpBytes: Uint8Array;
  try {
    webpBytes = await encodeWebpImage(resized, {
      quality: req.quality,
      lossless: req.lossless,
    });
  } catch (e: any) {
    return c.json({ error: `webp encode failed: ${e?.message || String(e)}` }, 500 as any);
  }

  return new Response(webpBytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'no-store',
      'X-Resize-Filter': filter,
      'X-Resize-Source': `${decoded.width}x${decoded.height}`,
      'X-Resize-Target': `${target.w}x${target.h}`,
      ...(unsharpAmount === undefined && req.unsharpAmount != null
        ? { 'X-Unsharp-Skipped': '1' }
        : {}),
    },
  });
});

/**
 * Parse the resize request. Supports two body shapes:
 *  1. Raw binary body (image bytes) + params via query string.
 *  2. JSON body { image: <base64>, width, ... } — fallback for clients
 *     that can't easily send binary over a service-binding fetch.
 */
async function parseRequest(c: any): Promise<ResizeRequest> {
  const ct = (c.req.header('content-type') || '').toLowerCase();

  if (ct.includes('application/json')) {
    const body = await c.req.json();
    const imageBytes = decodeBase64ToBytes(body.image);
    return {
      image: imageBytes,
      format: body.format,
      width: num(body.width),
      height: num(body.height),
      quality: num(body.quality),
      fit: body.fit,
      filter: body.filter,
      lossless: body.lossless,
      unsharpAmount: num(body.unsharpAmount),
      unsharpRadius: num(body.unsharpRadius),
      unsharpThreshold: num(body.unsharpThreshold),
    };
  }

  // Treat as binary body. Params come from query string.
  const q = c.req.query.bind(c.req);
  const image = await c.req.arrayBuffer();
  return {
    image,
    width: num(q('w') || q('width')),
    height: num(q('h') || q('height')),
    quality: num(q('q') || q('quality')),
    fit: q('fit'),
    filter: q('filter'),
    lossless: q('lossless') === '1' || q('lossless') === 'true',
    unsharpAmount: num(q('unsharpAmount') || q('usm')),
    unsharpRadius: num(q('unsharpRadius')),
    unsharpThreshold: num(q('unsharpThreshold')),
  };
}

function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function decodeBase64ToBytes(b64: unknown): Uint8Array {
  if (typeof b64 !== 'string') throw new ResizeValidationError('image must be base64 string or binary', 400);
  // atob is available in workerd. Convert without leaking high bits.
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

export default app;
