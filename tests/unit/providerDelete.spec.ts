import { describe, it, expect } from 'vitest';
import providersApi from '../../src/routes/admin/api/providers';
import { Hono } from 'hono';
import { AppEnvironment } from '../../src/types/env';

describe('providersApi delete protection', () => {
  const createTestApp = () => {
    const app = new Hono<AppEnvironment>();
    app.route('/providers', providersApi);
    return app;
  };

  it('存储提供商下包含现有文件时拒绝删除并返回 409', async () => {
    const app = createTestApp();
    const db: any = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes('COUNT(*) as count FROM path_providers')) {
              return { count: 5 };
            }
            return null;
          }
        })
      })
    };

    const req = new Request('http://localhost/providers/gdrive-1', { method: 'DELETE' });
    const res = await app.fetch(req, { DB: db } as any);

    expect(res.status).toBe(409);
    const data: any = await res.json();
    expect(data.error).toBe('Cannot delete provider with existing files');
    expect(data.details).toContain('5 files');
  });

  it('存储提供商下无文件时允许成功删除', async () => {
    const app = createTestApp();
    let deleteExecuted = false;
    const db: any = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes('COUNT(*) as count FROM path_providers')) {
              return { count: 0 };
            }
            return null;
          },
          run: async () => {
            if (sql.includes('DELETE FROM providers')) {
              deleteExecuted = true;
            }
            return { success: true };
          }
        })
      })
    };

    const req = new Request('http://localhost/providers/gdrive-empty', { method: 'DELETE' });
    const res = await app.fetch(req, { DB: db } as any, { waitUntil: () => {} } as any);

    expect(res.status).toBe(200);
    expect(deleteExecuted).toBe(true);
  });
});
