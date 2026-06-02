/**
 * Lightweight image metadata stripping for Cloudflare Workers.
 * Supports JPEG and PNG.
 */

export async function stripMetadata(buffer: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  const uint8 = new Uint8Array(buffer);
  
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return stripJpegMetadata(uint8);
  } else if (mimeType === 'image/png') {
    return stripPngMetadata(uint8);
  }
  
  return buffer;
}

/**
 * Strips APPn segments (like EXIF) from JPEG.
 */
function stripJpegMetadata(data: Uint8Array): ArrayBuffer {
  // JPEG must start with FF D8
  if (data[0] !== 0xFF || data[1] !== 0xD8) return data.buffer as ArrayBuffer;

  const result: number[] = [0xFF, 0xD8];
  let i = 2;

  while (i < data.length) {
    if (data[i] !== 0xFF) {
      i++;
      continue;
    }

    const marker = data[i + 1];
    if (marker === 0xD9) { // End of image
      result.push(0xFF, 0xD9);
      break;
    }

    // Segment length is next 2 bytes
    const length = (data[i + 2] << 8) | data[i + 3];
    
    // Check if it's an APP segment (E0-EF)
    // We keep E0 (JFIF) usually, but E1 (EXIF) is the main one to strip.
    // To be safe and aggressive, we strip E1-EF.
    const isMetadataSegment = marker >= 0xE1 && marker <= 0xEF;

    if (!isMetadataSegment) {
      for (let j = 0; j < length + 2; j++) {
        if (i + j < data.length) result.push(data[i + j]);
      }
    }

    i += length + 2;
    
    // SOS (Start of Scan) - image data starts after this, no more segments to parse
    if (marker === 0xDA) {
      while (i < data.length) {
        result.push(data[i]);
        i++;
      }
      break;
    }
  }

  return new Uint8Array(result).buffer;
}

/**
 * Strips ancillary chunks (tEXt, zTXt, iTXt, pHYs) from PNG.
 */
function stripPngMetadata(data: Uint8Array): ArrayBuffer {
  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== signature[i]) return data.buffer as ArrayBuffer;
  }

  const result: number[] = [...signature];
  let i = 8;

  while (i < data.length) {
    const length = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
    const type = String.fromCharCode(data[i + 4], data[i + 5], data[i + 6], data[i + 7]);
    
    // Ancillary chunks start with lowercase first letter.
    // Critical chunks (IHDR, PLTE, IDAT, IEND) start with Uppercase.
    // We specifically target metadata chunks.
    const chunksToStrip = ['tEXt', 'zTXt', 'iTXt', 'pHYs', 'tIME'];
    const isMetadataChunk = chunksToStrip.includes(type);

    if (!isMetadataChunk) {
      for (let j = 0; j < length + 12; j++) {
        if (i + j < data.length) result.push(data[i + j]);
      }
    }

    i += length + 12;
    if (type === 'IEND') break;
  }

  return new Uint8Array(result).buffer;
}
