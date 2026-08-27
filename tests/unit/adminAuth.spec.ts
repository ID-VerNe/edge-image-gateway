import { describe, it, expect } from 'vitest';
import { adminAuthGuard } from '../../src/middleware/adminAuth';
import { generateHMAC } from '../../src/utils/hmac';
import { Hono } from 'hono';
import { AppEnvironment } from '../../src/types/env';

describe('adminAuthGuard', () => {
  const secret = 'test-secret';
  const adminEmail = 'admin@example.com';

  const createTestApp = () => {
    const app = new Hono<AppEnvironment>();
    app.use('/*', adminAuthGuard);
    app.all('/admin/api/test', (c) => c.json({ ok: true, user: c.get('user') }));
    app.all('/admin/api/files/*', (c) => c.json({ ok: true, user: c.get('user') }));
    app.post('/admin/api/upload', (c) => c.json({ ok: true, user: c.get('user') }));
    return app;
  };

  it('允许带合法 Cloudflare Access Header 的请求并设置签名 Cookie', async () => {
    const app = createTestApp();
    const env = { ADMIN_EMAILS: adminEmail, SIGN_SECRET: secret };
    const req = new Request('http://localhost/admin/api/test', {
      headers: { 'Cf-Access-Authenticated-User-Email': adminEmail }
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.user.email).toBe(adminEmail);
    expect(res.headers.get('Set-Cookie')).toContain('admin_session=');
  });

  it('拒绝未签名的裸 Session Cookie (防 Cookie 伪造/提权)', async () => {
    const app = createTestApp();
    const env = { ADMIN_EMAILS: adminEmail, SIGN_SECRET: secret };
    const req = new Request('http://localhost/admin/api/test', {
      headers: { Cookie: `admin_session=${adminEmail}` }
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('允许带有有效 HMAC 签名的 Session Cookie', async () => {
    const app = createTestApp();
    const env = { ADMIN_EMAILS: adminEmail, SIGN_SECRET: secret };
    const sig = await generateHMAC(`session:${adminEmail}`, secret);
    const req = new Request('http://localhost/admin/api/test', {
      headers: { Cookie: `admin_session=${adminEmail}.${sig}` }
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.user.email).toBe(adminEmail);
  });

  it('PUT/PATCH 请求需要 write 权限，无 write 权限应返回 403', async () => {
    const app = createTestApp();
    const db: any = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            token: 'read-only-token',
            name: 'Reader',
            permissions: JSON.stringify(['read']),
          })
        })
      })
    };
    const env = { ADMIN_EMAILS: adminEmail, SIGN_SECRET: secret, DB: db };
    const req = new Request('http://localhost/admin/api/test', {
      method: 'PUT',
      headers: { Authorization: 'Bearer read-only-token' }
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(403);
  });
});
