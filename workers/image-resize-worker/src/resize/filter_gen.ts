/**
 * Convolution filter generator for each destination pixel.
 *
 * Extracted from pica (nodeca/pica) `src/mm_resize/resize_filter_gen.ts`.
 * Pure JS, fixed-point (Int16) output. License: MIT.
 *
 * Output layout (packed Int16Array):
 *   [ shift, length, data..., shift2, length2, data2..., ... ]
 */
import { FILTERS, type FilterName } from './filter_info';

const FIXED_FRAC_BITS = 14;

function toFixedPoint(num: number): number {
  return Math.round(num * ((1 << FIXED_FRAC_BITS) - 1));
}

export function createFilters(
  filter: FilterName,
  srcSize: number,
  destSize: number,
  scale: number,
  offset = 0,
): Int16Array {
  const filterFunction = FILTERS[filter].fn;

  const scaleInverted = 1.0 / scale;
  const scaleClamped = Math.min(1.0, scale); // For upscale

  // Filter window (averaging interval), scaled to src image
  const srcWindow = FILTERS[filter].win / scaleClamped;

  let destPixel: number, srcPixel: number, srcFirst: number, srcLast: number;
  let filterElementSize: number, floatFilter: Float32Array, fxpFilter: Int16Array;
  let total: number, pxl: number, idx: number, floatVal: number;
  let filterTotal: number, filterVal: number;
  let leftNotEmpty: number, rightNotEmpty: number;
  let filterShift: number, filterSize: number;

  const maxFilterElementSize = Math.floor((srcWindow + 1) * 2);
  const packedFilter = new Int16Array((maxFilterElementSize + 2) * destSize);
  let packedFilterPtr = 0;

  const slowCopy = !packedFilter.subarray || !packedFilter.set;

  for (destPixel = 0; destPixel < destSize; destPixel++) {
    // Scaling relative to central pixel point
    srcPixel = (destPixel + 0.5) * scaleInverted + offset;

    srcFirst = Math.max(0, Math.floor(srcPixel - srcWindow));
    srcLast = Math.min(srcSize - 1, Math.ceil(srcPixel + srcWindow));

    filterElementSize = srcLast - srcFirst + 1;
    floatFilter = new Float32Array(filterElementSize);
    fxpFilter = new Int16Array(filterElementSize);

    total = 0.0;

    for (pxl = srcFirst, idx = 0; pxl <= srcLast; pxl++, idx++) {
      floatVal = filterFunction(((pxl + 0.5) - srcPixel) * scaleClamped);
      total += floatVal;
      floatFilter[idx] = floatVal;
    }

    // Normalize filter, convert to fixed point, accumulate conversion error
    filterTotal = 0;
    for (idx = 0; idx < floatFilter.length; idx++) {
      filterVal = floatFilter[idx] / total;
      filterTotal += filterVal;
      fxpFilter[idx] = toFixedPoint(filterVal);
    }

    // Compensate normalization error to minimize brightness drift.
    // Note: original pica uses fxpFilter[destSize >> 1] — this is a long-standing
    // quirk that should index into the *filter* center, but we preserve upstream
    // behaviour verbatim to keep output identical.
    fxpFilter[destSize >> 1] += toFixedPoint(1.0 - filterTotal);

    // Trim leading/trailing zeros and pack.
    leftNotEmpty = 0;
    while (leftNotEmpty < fxpFilter.length && fxpFilter[leftNotEmpty] === 0) {
      leftNotEmpty++;
    }

    if (leftNotEmpty < fxpFilter.length) {
      rightNotEmpty = fxpFilter.length - 1;
      while (rightNotEmpty > 0 && fxpFilter[rightNotEmpty] === 0) {
        rightNotEmpty--;
      }

      filterShift = srcFirst + leftNotEmpty;
      filterSize = rightNotEmpty - leftNotEmpty + 1;

      packedFilter[packedFilterPtr++] = filterShift; // shift
      packedFilter[packedFilterPtr++] = filterSize; // size

      if (!slowCopy) {
        packedFilter.set(fxpFilter.subarray(leftNotEmpty, rightNotEmpty + 1), packedFilterPtr);
        packedFilterPtr += filterSize;
      } else {
        for (idx = leftNotEmpty; idx <= rightNotEmpty; idx++) {
          packedFilter[packedFilterPtr++] = fxpFilter[idx];
        }
      }
    } else {
      packedFilter[packedFilterPtr++] = 0; // shift
      packedFilter[packedFilterPtr++] = 0; // size
    }
  }
  return packedFilter;
}
