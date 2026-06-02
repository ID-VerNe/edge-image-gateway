/**
 * Simple TOTP validator using Web Crypto API.
 * Designed for Cloudflare Workers.
 */

async function hmacSha1(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, data);
}

function base32ToBuffer(base32: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=/g, '');
  const len = cleaned.length;
  const buffer = new Uint8Array(Math.floor((len * 5) / 8));

  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < len; i++) {
    const char = cleaned[i];
    const val = alphabet.indexOf(char);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 0xFF;
      bits -= 8;
    }
  }
  return buffer.buffer;
}

export async function verifyTOTP(token: string, secret: string, window: number = 1): Promise<boolean> {
  if (!token || !secret) return false;
  
  // Clean secret (remove spaces)
  const cleanSecret = secret.replace(/\s/g, '');
  const keyBuffer = base32ToBuffer(cleanSecret);
  const currentTime = Math.floor(Date.now() / 1000 / 30);

  for (let i = -window; i <= window; i++) {
    const counter = BigInt(currentTime + i);
    const counterBuffer = new Uint8Array(8);
    const view = new DataView(counterBuffer.buffer);
    view.setBigUint64(0, counter, false);

    const hmac = await hmacSha1(keyBuffer, counterBuffer.buffer);
    const hmacArray = new Uint8Array(hmac);
    const offset = hmacArray[hmacArray.length - 1] & 0x0f;
    
    const code = (
      ((hmacArray[offset] & 0x7f) << 24) |
      ((hmacArray[offset + 1] & 0xff) << 16) |
      ((hmacArray[offset + 2] & 0xff) << 8) |
      (hmacArray[offset + 3] & 0xff)
    ) % 1000000;

    if (code.toString().padStart(6, '0') === token.padStart(6, '0')) {
      return true;
    }
  }

  return false;
}
