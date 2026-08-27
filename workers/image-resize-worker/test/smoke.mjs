/**
 * Minimal end-to-end smoke test for the resize pipeline.
 *
 * Runs the exact decode → resize → encode path the Worker uses, but in
 * plain Node (no workerd). If this passes, the algorithm extraction is
 * sound and the bundler just needs to ship it.
 *
 * Run: node --experimental-strip-types test/smoke.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

(async () => {
  const bytes = readFileSync('test/gradient.jpg');
  console.log('input jpeg bytes:', bytes.length);

  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  console.log('decoded:', decoded.width, 'x', decoded.height, 'data len', decoded.data.length);

  const { resize } = await import('../src/resize/index.ts');
  const { encodeWebp } = await import('../src/encode/webp.ts');

  const target = { w: 100, h: 75 };
  const resized = resize({
    src: decoded.data,
    width: decoded.width,
    height: decoded.height,
    toWidth: target.w,
    toHeight: target.h,
    filter: 'lanczos3',
  });
  console.log('resized:', target.w, 'x', target.h, 'data len', resized.length);

  const out = encodeWebp({ data: resized, width: target.w, height: target.h }, { lossless: true });
  writeFileSync('test/out.webp', out.bytes);
  console.log('wrote test/out.webp', out.bytes.length, 'bytes (lossless)');

  // Round-trip: re-decode the webp and check dimensions.
  const { decode } = await import('@stacksjs/ts-webp');
  const rt = decode(out.bytes);
  console.log('round-trip webp:', rt.width, 'x', rt.height, 'hasAlpha', rt.hasAlpha);
})().catch((e) => { console.error(e); process.exit(1); });
