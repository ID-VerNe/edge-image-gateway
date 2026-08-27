/**
 * Unsharp mask (HSV V-channel).
 *
 * Extracted from pica (nodeca/pica) `src/mm_unsharp_mask/unsharp_mask.ts`.
 * Depends on `glur` (pure-JS mono16 gaussian blur). License: MIT.
 */
import { blurMono16 } from 'glur';

type SrcBuffer = Uint8Array | Uint8ClampedArray;

function hsvV16(img: SrcBuffer, width: number, height: number): Uint16Array {
  const size = width * height;
  const out = new Uint16Array(size);
  let r: number, g: number, b: number, max: number;
  for (let i = 0; i < size; i++) {
    r = img[4 * i];
    g = img[4 * i + 1];
    b = img[4 * i + 2];
    max = r >= g && r >= b ? r : g >= b && g >= r ? g : b;
    out[i] = max << 8;
  }
  return out;
}

export function unsharp(
  img: SrcBuffer,
  width: number,
  height: number,
  amount: number,
  radius: number,
  threshold: number,
): void {
  let v1: number, v2: number, vmul: number;
  let diff: number, iTimes4: number;

  if (amount === 0 || radius < 0.5) return;
  if (radius > 2.0) radius = 2.0;

  const brightness = hsvV16(img, width, height);
  const blured = new Uint16Array(brightness); // copy — blur mutates src

  blurMono16(blured, width, height, radius);

  const amountFp = (amount / 100 * 0x1000 + 0.5) | 0;
  const thresholdFp = threshold << 8;

  const size = width * height;
  for (let i = 0; i < size; i++) {
    v1 = brightness[i];
    diff = v1 - blured[i];

    if (Math.abs(diff) >= thresholdFp) {
      v2 = v1 + ((amountFp * diff + 0x800) >> 12);
      v2 = v2 > 0xff00 ? 0xff00 : v2;
      v2 = v2 < 0x0000 ? 0x0000 : v2;

      // V=0 ⇒ rgb(0,0,0); unsharp can't lift it (diff inflates), guard div-by-0.
      v1 = v1 !== 0 ? v1 : 1;
      vmul = ((v2 << 12) / v1) | 0;

      iTimes4 = i * 4;
      img[iTimes4] = (img[iTimes4] * vmul + 0x800) >> 12; // R
      img[iTimes4 + 1] = (img[iTimes4 + 1] * vmul + 0x800) >> 12; // G
      img[iTimes4 + 2] = (img[iTimes4 + 2] * vmul + 0x800) >> 12; // B
    }
  }
}
