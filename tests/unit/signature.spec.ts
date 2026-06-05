import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signatureGuard } from '../../src/middleware/signature';
import { generateHMAC } from '../../src/utils/hmac';
import { Context } from 'hono';

describe('signatureGuard', () => {
  const SECRET = 'test_secret_key_123456';

  const createMockContext = (path: string, searchParams: Record<string, string>, envOverrides: any = {}, headers: Record<string, string> = {}) => {
    const url = new URL(`https://example.com${path}`);
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
    
    return {
      req: {
        url: url.toString(),
        path,
        query: (k: string) => searchParams[k],
        header: (k: string) => headers[k] || headers[k.toLowerCase()] || undefined,
      },
      env: {
        SIGN_SECRET: SECRET,
        ENABLE_SIGNATURE: 'true',
        ...envOverrides
      },
      text: (msg: string, status: number) => ({ type: 'text', msg, status }),
      json: (data: any, status: number) => ({ type: 'json', data, status }),
    } as unknown as Context;
  };

  const next = vi.fn().mockResolvedValue({ type: 'next' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== 基础签名验证 ==========
  it('合法签名 + 未过期 → 放行', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
    const path = '/private/image.jpg';
    const sig = await generateHMAC(`${path}|${exp}`, SECRET);
    
    const c = createMockContext(path, { exp: exp.toString(), sig });
    const result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
    expect(next).toHaveBeenCalled();
  });

  it('签名正确但已过期 → 拒绝', async () => {
    const exp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const path = '/private/image.jpg';
    const sig = await generateHMAC(`${path}|${exp}`, SECRET);
    
    const c = createMockContext(path, { exp: exp.toString(), sig });
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('Expired Signature');
    expect(next).not.toHaveBeenCalled();
  });

  it('伪造签名(随机字符串) → 拒绝', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const c = createMockContext('/private/img.jpg', { exp: exp.toString(), sig: 'invalid_sig_abc' });
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('Invalid Signature');
  });

  it('篡改路径但复用旧签名 → 拒绝', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const oldPath = '/private/old.jpg';
    const sig = await generateHMAC(`${oldPath}|${exp}`, SECRET); // Signature for old path
    
    // Attacker tries to use it for new path
    const c = createMockContext('/private/new.jpg', { exp: exp.toString(), sig });
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
  });

  // ========== 系统与内部路径绕过 ==========
  it('系统路径 (/healthz, /admin) → 自动跳过签名检查', async () => {
    let c = createMockContext('/healthz', {});
    let result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
    
    c = createMockContext('/admin/dashboard', {});
    result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
  });

  it('带合法 __internal_loopback 签名 → 跳过中间件', async () => {
    const path = '/image.jpg';
    const internalSig = await generateHMAC(path, SECRET);
    const c = createMockContext(path, { __internal_loopback: 'true', __sig: internalSig });
    const result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
  });

  it('伪造 __internal_loopback 签名 → 不应被跳过', async () => {
    const path = '/private/secret.jpg';
    const c = createMockContext(path, { __internal_loopback: 'true', __sig: 'fake_sig' });
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
  });

  // ========== ALLOWED_REFERERS 与防盗链/信任源 ==========
  it('配置白名单且 Referer 命中 → 放行非严格路径 (无需签名)', async () => {
    const c = createMockContext('/public/photo.jpg', {}, 
      { ALLOWED_REFERERS: 'example.com, myblog.com', ENABLE_SIGNATURE: 'true' }, 
      { referer: 'https://myblog.com/page1', 'sec-fetch-dest': 'image' }
    );
    const result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
  });

  it('配置白名单但 Referer 不匹配 → 需要签名', async () => {
    const c = createMockContext('/public/photo.jpg', {}, 
      { ALLOWED_REFERERS: 'example.com', ENABLE_SIGNATURE: 'true' }, 
      { referer: 'https://evil.com/page1', 'sec-fetch-dest': 'image' }
    );
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('signature required');
  });

  // ========== ENABLE_SIGNATURE=false 与 严格路径 (Tiered Path) ==========
  it('ENABLE_SIGNATURE=false 且无签名访问普通路径 → 放行', async () => {
    const c = createMockContext('/images/pic.jpg', {}, { ENABLE_SIGNATURE: 'false' });
    const result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
  });

  it('ENABLE_SIGNATURE=false 但访问 /private/ 路径 → 强制要求签名', async () => {
    const c = createMockContext('/private/secret.jpg', {}, { ENABLE_SIGNATURE: 'false' });
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('signature required');
  });

  it('ENABLE_SIGNATURE=false 且访问 /private/ 路径提供合法签名 → 放行', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const path = '/private/secret.jpg';
    const sig = await generateHMAC(`${path}|${exp}`, SECRET);
    
    const c = createMockContext(path, { exp: exp.toString(), sig }, { ENABLE_SIGNATURE: 'false' });
    const result = await signatureGuard(c, next) as any;
    expect(result.type).toBe('next');
  });

  // ========== EMERGENCY_LOCKDOWN ==========
  it('EMERGENCY_LOCKDOWN=true → 拒绝任何未签名请求', async () => {
    // Even if it's a trusted referer and non-strict path
    const c = createMockContext('/public/img.jpg', {}, 
      { EMERGENCY_LOCKDOWN: 'true', ALLOWED_REFERERS: 'example.com' },
      { referer: 'https://example.com' }
    );
    const result = await signatureGuard(c, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('Emergency Lockdown Active');
  });
});
