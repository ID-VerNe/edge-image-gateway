import { describe, it, expect, vi } from 'vitest';
import { dbService } from '../../src/services/database';

describe('双写一致性 (D1 Primary + KV Fallback)', () => {

  it('D1 写入失败时应当抛出异常中断执行，防止产生仅有 KV 的孤儿索引', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockRejectedValue(new Error('D1 connection failed'))
        })
      }),
      batch: vi.fn().mockRejectedValue(new Error('D1 batch failed'))
    };

    await expect(dbService.recordFileAddition(mockDb as any, '/a.jpg', 'repo-1', 100, 'hash'))
      .rejects.toThrow('D1 batch failed');
  });

  describe('resolveForRead 降级链', () => {
    const mockBindings = (db: any, kv: any): any => ({
      DB: db,
      REPO_REGISTRY: kv,
      GITHUB_USER: 'test',
      GITHUB_REPO: 'repo',
      GITHUB_TOKEN: 'token'
    });

    it('当 D1 查询异常时，应当平滑降级到 KV 查询', async () => {
      const { resolveForRead, invalidateRepoCache } = await import('../../src/services/repoRouter');
      invalidateRepoCache();
      
      const prepareObj = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error('D1 Timeout')),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
      const db = {
        prepare: vi.fn().mockReturnValue(prepareObj)
      };

      const kv = {
        get: vi.fn().mockImplementation(async (key: string, type?: string) => {
          if (key === 'path::/a.jpg') return JSON.stringify({ repoId: 'repo-kv' });
          if (key === 'repo::repo-kv') {
            const val = { id: 'repo-kv', status: 'active', owner: 'test', name: 'repo', branch: 'main', capacityLimitBytes: 1000, sizeBytes: 0, fileCount: 0, createdAt: '', tokenSecretName: 'GITHUB_TOKEN' };
            return type === 'json' ? val : JSON.stringify(val);
          }
          return null;
        }),
        list: vi.fn().mockResolvedValue({ keys: [{ name: 'repo::repo-kv' }] })
      };

      const repo = await resolveForRead('/a.jpg', mockBindings(db, kv));
      expect(repo.meta.id).toBe('repo-kv');
    });

    it('当 D1 和 KV 都不匹配时，应当落入规则匹配或兜底', async () => {
      const { resolveForRead, invalidateRepoCache } = await import('../../src/services/repoRouter');
      invalidateRepoCache();
      
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null)
          })
        })
      };

      const kv = {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue({ keys: [] })
      };

      const repo = await resolveForRead('/any.jpg', mockBindings(db, kv));
      // fallback id is "fallback"
      expect(repo.meta.id).toBe('fallback');
    });
  });
});
