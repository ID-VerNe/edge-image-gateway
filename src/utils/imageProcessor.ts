/**
 * Lightweight image metadata stripping for Cloudflare Workers.
 * Optimized for performance and memory usage.
 * Supports JPEG and PNG.
 */

export async function stripMetadata(buffer: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  const uint8 = new Uint8Array(buffer);
  
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return stripJpegMetadata(uint8);
    } else if (mimeType === 'image/png') {
      return stripPngMetadata(uint8);
    }
  } catch (e) {
    console.error('Metadata stripping failed, returning original buffer:', e);
  }
  
  return buffer;
}

/**
 * Strips APPn segments (like EXIF) from JPEG using Uint8Array views.
 */
function stripJpegMetadata(data: Uint8Array): ArrayBuffer {
  // JPEG must start with FF D8
  if (data[0] !== 0xFF || data[1] !== 0xD8) return data.buffer as ArrayBuffer;

  // Pre-allocate a buffer of the same size (worst case)
  const result = new Uint8Array(data.length);
  result[0] = 0xFF;
  result[1] = 0xD8;
  let offset = 2;
  let i = 2;

  while (i < data.length) {
    if (data[i] !== 0xFF) {
      i++;
      continue;
    }

    const marker = data[i + 1];
    if (marker === 0xD9) { // End of image
      result[offset++] = 0xFF;
      result[offset++] = 0xD9;
      break;
    }

    // Segment length is next 2 bytes
    if (i + 3 >= data.length) break;
    const length = (data[i + 2] << 8) | data[i + 3];
    
    // Check if it's an APP segment (E1-EF). We keep E0 (JFIF).
    const isMetadataSegment = marker >= 0xE1 && marker <= 0xEF;

    if (!isMetadataSegment) {
      const segmentTotalLength = length + 2;
      if (i + segmentTotalLength <= data.length) {
        result.set(data.subarray(i, i + segmentTotalLength), offset);
        offset += segmentTotalLength;
      }
    }

    i += length + 2;
    
    // SOS (Start of Scan) - image data starts after this, no more segments to parse
    if (marker === 0xDA) {
      const remaining = data.length - i;
      if (remaining > 0) {
        result.set(data.subarray(i), offset);
        offset += remaining;
      }
      break;
    }
  }

  return result.buffer.slice(0, offset);
}

/**
 * Strips ancillary chunks (tEXt, zTXt, iTXt, pHYs) from PNG.
 */
function stripPngMetadata(data: Uint8Array): ArrayBuffer {
  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  for (let i = 0; i < 8; i++) {
    if (data[i] !== signature[i]) return data.buffer as ArrayBuffer;
  }

  const result = new Uint8Array(data.length);
  result.set(signature, 0);
  let offset = 8;
  let i = 8;

  while (i < data.length) {
    if (i + 8 > data.length) break;
    const length = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
    
    // Get chunk type
    const type = String.fromCharCode(data[i + 4], data[i + 5], data[i + 6], data[i + 7]);
    
    // Ancillary chunks start with lowercase first letter.
    const chunksToStrip = ['tEXt', 'zTXt', 'iTXt', 'pHYs', 'tIME', 'iCCP', 'eXIf'];
    const isMetadataChunk = chunksToStrip.includes(type);

    const chunkTotalLength = length + 12;
    if (i + chunkTotalLength > data.length) break;

    if (!isMetadataChunk) {
      result.set(data.subarray(i, i + chunkTotalLength), offset);
      offset += chunkTotalLength;
    }

    i += chunkTotalLength;
    if (type === 'IEND') break;
  }

  return result.buffer.slice(0, offset);
}
