# Third-Party Notices

This Worker composes code from several open-source projects.

## pica (nodeca/pica) — MIT
Copyright (c) Vitaly Puzrin.
Extracted pure-JS resize algorithm from `src/mm_resize/` and
`src/mm_unsharp_mask/`:
  - src/resize/convolve.ts
  - src/resize/filter_gen.ts
  - src/resize/filter_info.ts
  - src/resize/index.ts (orchestrator, adapted)
  - src/resize/unsharp.ts
WASM paths, multimath dispatch, and tiling machinery were dropped.

## @jsquash/jpeg — Apache-2.0
Copyright 2020 Google Inc.
Used for JPEG decode via mozjpeg WASM (codec/dec/mozjpeg_dec.wasm).
Mozilla JPEG Encoder Project (mozjpeg) — BSD-3-Clause.

## @jsquash/png — Apache-2.0
Copyright 2020 Google Inc.
Used for PNG decode via rust-png WASM (codec/pkg/squoosh_png_bg.wasm).
rust-png — MIT / Apache-2.0.

## @jsquash/webp — Apache-2.0
Copyright 2020 Google Inc.
Used for WebP encode via libwebp WASM (codec/enc/webp_enc_simd.wasm).
libwebp — BSD-3-Clause.

## glur (dirkarnez/glur) — MIT
Used as-is via npm (mono16 gaussian blur, unsharp mask dependency).