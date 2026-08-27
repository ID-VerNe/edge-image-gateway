import { describe, it, expect } from 'vitest';
import { normalizePath } from '../../src/utils/path';
import { GoogleDriveProvider } from '../../src/providers/googledrive/GoogleDriveProvider';

describe('Security Utilities & Protections', () => {
  describe('normalizePath Path Traversal Protections', () => {
    it('拒绝包含 .. 的路径', () => {
      expect(normalizePath('/foo/../bar')).toBeNull();
      expect(normalizePath('../etc/passwd')).toBeNull();
      expect(normalizePath('foo/bar/..')).toBeNull();
    });

    it('正确规范化合法路径', () => {
      expect(normalizePath('foo/bar')).toBe('/foo/bar');
      expect(normalizePath('//foo///bar/')).toBe('/foo/bar');
      expect(normalizePath('/')).toBe('/');
    });
  });

  describe('GoogleDriveProvider HMAC Signing Secret', () => {
    it('使用传入的 secret 生成带有 exp 和 sig 的签名 URL', async () => {
      const provider = new GoogleDriveProvider('gd-1', {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      });

      const signedUrl = await provider.getSignedUrl('photos/test.jpg', 3600, 'my-custom-secret');
      expect(signedUrl).toContain('/photos/test.jpg?sig=');
      expect(signedUrl).toContain('&exp=');
    });
  });
});
