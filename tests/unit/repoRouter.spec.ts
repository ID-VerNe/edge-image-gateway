import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockD1 } from '../helpers/mockDB';
import { resolveForWrite, resolveForRead, invalidateRepoCache } from '../../src/services/repoRouter';

describe('repoRouter', () => {
  beforeEach(() => {
    invalidateRepoCache();
  });

  const baseEnv: any = {
    GITHUB_USER: 'default-user',
    GITHUB_REPO: 'default-repo',
    GITHUB_BRANCH: 'main',
    GITHUB_TOKEN: 'default-token',
  };

  describe('resolveForWrite', () => {
    it('当前写仓库未满 → 返回当前写仓库', async () => {
      const db = makeMockD1({
        repos: [
          { id: 'repo-a', owner: 'u', name: 'r-a', sizeBytes: 1e9, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_A' },
          { id: 'repo-b', owner: 'u', name: 'r-b', sizeBytes: 0, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_B' },
        ],
        configs: {
          'route::current_write': 'repo-a',
        }
      });
      const env = { ...baseEnv, DB: db, TOKEN_A: 'token-a' };
      const result = await resolveForWrite(env, 1e9); // Needs 1GB
      expect(result.meta.id).toBe('repo-a');
      expect(result.token).toBe('token-a');
    });

    it('当前写仓库已满 → 自动切换到下一个 active 仓库', async () => {
      const db = makeMockD1({
        repos: [
          { id: 'repo-a', owner: 'u', name: 'r-a', sizeBytes: 5e9, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_A' },
          { id: 'repo-b', owner: 'u', name: 'r-b', sizeBytes: 0, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_B' },
        ],
        configs: {
          'route::current_write': 'repo-a',
        }
      });
      const env = { ...baseEnv, DB: db, TOKEN_B: 'token-b' };
      
      const result = await resolveForWrite(env, 100); // repo-a is full
      expect(result.meta.id).toBe('repo-b');
      expect(result.token).toBe('token-b');
    });

    it('DB 不可用 → 回退到环境变量默认仓库', async () => {
      const env = { ...baseEnv };
      const result = await resolveForWrite(env, 100);
      expect(result.meta.id).toBe('fallback');
      expect(result.meta.owner).toBe('default-user');
      expect(result.token).toBe('default-token');
    });
  });

  describe('resolveForRead', () => {
    it('命中 path 精确索引 → 直接定位仓库', async () => {
      const db = makeMockD1({
        repos: [
          { id: 'repo-a', owner: 'u', name: 'r-a', status: 'active', tokenSecretName: 'TOKEN_A' },
          { id: 'repo-b', owner: 'u', name: 'r-b', status: 'active', tokenSecretName: 'TOKEN_B' },
        ],
        paths: {
          '/images/test.jpg': 'repo-b'
        }
      });
      const env = { ...baseEnv, DB: db, TOKEN_B: 'token-b' };
      const result = await resolveForRead('/images/test.jpg', env);
      expect(result.meta.id).toBe('repo-b');
      expect(result.token).toBe('token-b');
    });

    it('未命中索引但命中 read_rules 前缀 → 走前缀规则', async () => {
      const db = makeMockD1({
        repos: [
          { id: 'repo-c', owner: 'u', name: 'r-c', status: 'readonly', tokenSecretName: 'TOKEN_C' }
        ],
        configs: {
          'route::read_rules': JSON.stringify([{ prefix: '/docs/', repo: 'repo-c' }])
        }
      });
      const env = { ...baseEnv, DB: db, TOKEN_C: 'token-c' };
      const result = await resolveForRead('/docs/readme.md', env);
      expect(result.meta.id).toBe('repo-c');
    });

    it('全部未命中 → 兜底到当前写仓库', async () => {
      const db = makeMockD1({
        repos: [
          { id: 'repo-default', owner: 'u', name: 'r-d', status: 'active', tokenSecretName: 'TOKEN_D' }
        ],
        configs: {
          'route::current_write': 'repo-default'
        }
      });
      const env = { ...baseEnv, DB: db, TOKEN_D: 'token-d' };
      const result = await resolveForRead('/unknown/path.jpg', env);
      expect(result.meta.id).toBe('repo-default');
    });
  });
});
