import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitGuard } from '../../src/middleware/rateLimit';
import { Context } from 'hono';

describe('rateLimitGuard', () => {
  const createMockContext = (ip: string, path: string, kvMock?: any) => {
    const executionCtx = {
      waitUntil: vi.fn((promise: Promise<any>) => promise),
    };
    return {
      req: {
        path,
        header: (k: string) => k === 'CF-Connecting-IP' ? ip : undefined,
      },
      env: {
        RATE_LIMIT_PER_MIN: '2', // Strict limit for testing
        REPO_REGISTRY: kvMock,
      },
      res: {
        status: 200,
      },
      text: (msg: string, status: number, headers?: any) => ({ type: 'text', msg, status, headers }),
      executionCtx,
    } as unknown as Context;
  };

  const next = vi.fn().mockResolvedValue({ type: 'next' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Assuming localCache and localBans in module are not exported, 
    // we need to test state changes by simulating requests.
  });

  it('桶内有令牌 → 放行并扣减', async () => {
    const c = createMockContext('1.1.1.1', '/image.jpg');
    const result = await rateLimitGuard(c, next) as any;
    expect(result).toBeUndefined(); // Returns nothing when successful (calls next)
    expect(next).toHaveBeenCalled();
  });

  it('令牌耗尽 → 返回 429', async () => {
    const ip = '2.2.2.2';
    // Request 1: OK
    await rateLimitGuard(createMockContext(ip, '/a.jpg'), next);
    // Request 2: OK
    await rateLimitGuard(createMockContext(ip, '/b.jpg'), next);
    // Request 3: OK (Count=3 is > limit 2? The logic is `record.count > rateLimit`)
    await rateLimitGuard(createMockContext(ip, '/c.jpg'), next);
    // Request 4: Blocked (429)
    const result = await rateLimitGuard(createMockContext(ip, '/d.jpg'), next) as any;
    
    expect(result.status).toBe(429);
    expect(result.msg).toContain('Too Many Requests');
  });

  it('时间推进后令牌补充 → 重新放行', async () => {
    const ip = '3.3.3.3';
    await rateLimitGuard(createMockContext(ip, '/a.jpg'), next);
    await rateLimitGuard(createMockContext(ip, '/b.jpg'), next);
    await rateLimitGuard(createMockContext(ip, '/c.jpg'), next);
    const blockedRes = await rateLimitGuard(createMockContext(ip, '/d.jpg'), next) as any;
    expect(blockedRes.status).toBe(429);

    // Advance 60s
    vi.advanceTimersByTime(60001);

    // Should be allowed again
    const c = createMockContext(ip, '/e.jpg');
    const result = await rateLimitGuard(c, next) as any;
    expect(result).toBeUndefined();
  });

  it('不同 IP 互不影响', async () => {
    const ip1 = '4.4.4.4';
    const ip2 = '5.5.5.5';

    await rateLimitGuard(createMockContext(ip1, '/a.jpg'), next);
    await rateLimitGuard(createMockContext(ip1, '/b.jpg'), next);
    await rateLimitGuard(createMockContext(ip1, '/c.jpg'), next);
    const blockedRes = await rateLimitGuard(createMockContext(ip1, '/d.jpg'), next) as any;
    expect(blockedRes.status).toBe(429);

    // IP2 should still be allowed
    const c2 = createMockContext(ip2, '/e.jpg');
    const result2 = await rateLimitGuard(c2, next) as any;
    expect(result2).toBeUndefined();
  });

  it('系统路径 (/healthz, /admin) → 自动跳过速率限制', async () => {
    const ip = '7.7.7.7';
    // Exhaust tokens for this IP first
    await rateLimitGuard(createMockContext(ip, '/a.jpg'), next);
    await rateLimitGuard(createMockContext(ip, '/b.jpg'), next);
    await rateLimitGuard(createMockContext(ip, '/c.jpg'), next);
    
    // Normal path should be blocked
    const blockedRes = await rateLimitGuard(createMockContext(ip, '/d.jpg'), next) as any;
    expect(blockedRes.status).toBe(429);

    // But /healthz should bypass the rate limit
    const cHealthz = createMockContext(ip, '/healthz');
    const resultHealthz = await rateLimitGuard(cHealthz, next) as any;
    expect(resultHealthz).toEqual({ type: 'next' });
    expect(next).toHaveBeenCalled();

    // And /admin should bypass
    const cAdmin = createMockContext(ip, '/admin/stats');
    const resultAdmin = await rateLimitGuard(cAdmin, next) as any;
    expect(resultAdmin).toEqual({ type: 'next' });
  });
  
  it('404 惩罚 → 超过阈值后被 Ban', async () => {
    const kvStore = new Map<string, string>();
    const kvMock = {
      get: async (k: string) => kvStore.get(k),
      put: async (k: string, v: string) => { kvStore.set(k, v); }
    };
    
    const ip = '6.6.6.6';
    
    // Create a specific context factory for this test with high limit
    const createMockContextHighLimit = (ipStr: string, pathStr: string, kv: any) => {
      const c = createMockContext(ipStr, pathStr, kv);
      c.env.RATE_LIMIT_PER_MIN = '100'; // High limit to avoid 429
      return c;
    };

    // Simulate 21 404 responses
    for (let i = 0; i < 21; i++) {
      const c = createMockContextHighLimit(ip, `/not-found-${i}.jpg`, kvMock);
      (c.res as any).status = 404;
      await rateLimitGuard(c, next);
      // Let promises in waitUntil resolve
      await new Promise(resolve => process.nextTick(resolve)); 
    }

    // Now, request 22 should be blocked by localBans or KV Ban
    const cBlocked = createMockContext(ip, '/any.jpg', kvMock);
    const result = await rateLimitGuard(cBlocked, next) as any;
    expect(result.status).toBe(403);
    expect(result.msg).toContain('Temporarily banned');
  });
});
