# image-resize-worker

Internal Cloudflare Worker that resizes JPEG/PNG → WebP using **WASM decoders**
(mozjpeg, rust-png) + pure-JS resize (pica Lanczos3) + WASM encoder (libwebp).
Fits within the 128MB workerd memory limit even for 24MP (6000×4000) images.

Invoked by `img-proxy` via service binding so the main Worker can stop depending
on the paid Cloudflare Image Resizing feature.

## Pipeline

```
decode (WASM) → resize (pica Lanczos3 + unsharp, pure JS) → encode (WASM)
```

| stage | library | license |
|-------|---------|---------|
| JPEG decode | `@jsquash/jpeg` (mozjpeg WASM) | Apache-2.0 / BSD-3 |
| PNG decode | `@jsquash/png` (rust-png WASM) | Apache-2.0 / MIT |
| Resize | extracted from `pica` `src/mm_resize/` + `mm_unsharp_mask/` | MIT |
| WebP encode | `@jsquash/webp` (libwebp WASM) | Apache-2.0 / BSD-3 |
| Gaussian blur (unsharp dep) | `glur` | MIT |

## Develop

```bash
pnpm install
pnpm typecheck          # tsc --noEmit
pnpm dev                # wrangler dev (local)
```

## API

### `POST /resize`

Two body shapes supported:

**Binary body** (preferred via service binding):
```
POST /resize?w=300&h=200&fit=cover&q=80&filter=lanczos3&lossless=0
Content-Type: application/octet-stream
<raw JPEG bytes>
→ 200 image/webp
```

**JSON body** (fallback):
```json
{ "image": "<base64>", "width": 300, "height": 200, "quality": 80,
  "fit": "cover", "filter": "lanczos3", "lossless": false,
  "unsharpAmount": 0, "unsharpRadius": 0.6, "unsharpThreshold": 0 }
```

Params:
| name | values | default |
|------|--------|---------|
| `width` / `w` | px | one of w/h required |
| `height` / `h` | px | — |
| `quality` / `q` | 1-100 (lossy only) | 80 |
| `fit` | `cover` \| `contain` \| `inside` \| `fill` | `cover` |
| `filter` | `box` \| `hamming` \| `lanczos2` \| `lanczos3` \| `mks2013` | `lanczos3` |
| `lossless` | `1`/`true` for VP8L | `true` |
| `unsharpAmount` | 0-100 (0 disables). Silently ignored for targets >8MP. | 0 |
| `unsharpRadius` | px, 0.5-2.0 | 0.6 |
| `unsharpThreshold` | 0-255 | 0 |

Status codes: `200` WebP · `413` input too large · `415` unsupported format ·
`422` bad params / decode fail · `500` encode fail.

### `GET /health` → `200 ok`

## Limits (Free plan safe)

- **Max input: 24MP** (e.g. 6000×4000) — RGBA decode buffer ~96MB, fits within
  the 128MB Worker memory limit with room for resize intermediates.
- **Max dimension: 8000px** on any edge.
- **Unsharp mask:** applied only when the target image is ≤8MP. For larger
  targets (e.g. 4000×3000 → 3000×3000 ≈ 9MP) unsharp is silently skipped to
  avoid the extra 16-bit Gaussian blur buffer pushing us over the 128MB wall.
- **CPU:** large downscale via Lanczos3 is O(srcW·destW + srcH·destH); the
  free-tier 10ms CPU wall may be hit for 24MP → small thumbnail. Measure before
  relying on it.

## Source provenance

Extracted pica code preserves original fixed-point arithmetic and
`|0`-coerced hot loops verbatim — see `NOTICE.md` for the full list and
upstream commit. The two-stage tiling + WASM dispatch from pica was
intentionally dropped to keep the code self-contained.