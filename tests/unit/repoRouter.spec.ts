import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockKV } from '../helpers/mockKV';
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
      const kv = makeMockKV({
        'route::current_write': 'repo-a',
        'repo::repo-a': JSON.stringify({ id: 'repo-a', sizeBytes: 1e9, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_A' }),
        'repo::repo-b': JSON.stringify({ id: 'repo-b', sizeBytes: 0, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_B' }),
      });
      const env = { ...baseEnv, REPO_REGISTRY: kv, TOKEN_A: 'token-a' };
      const result = await resolveForWrite(env, 1e9); // Needs 1GB
      expect(result.meta.id).toBe('repo-a');
      expect(result.token).toBe('token-a');
    });

    it('当前写仓库已满 → 自动切换到下一个 active 仓库', async () => {
      const kv = makeMockKV({
        'route::current_write': 'repo-a',
        'repo::repo-a': JSON.stringify({ id: 'repo-a', sizeBytes: 5e9, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_A' }),
        'repo::repo-b': JSON.stringify({ id: 'repo-b', sizeBytes: 0, capacityLimitBytes: 5e9, status: 'active', tokenSecretName: 'TOKEN_B' }),
      });
      const env = { ...baseEnv, REPO_REGISTRY: kv, TOKEN_B: 'token-b' };
      
      const result = await resolveForWrite(env, 100); // repo-a is full
      expect(result.meta.id).toBe('repo-b');
      expect(result.token).toBe('token-b');
      // DB is not provided, so it won't persist the current_write to KV directly (the code only persists to DB). 
      // This is a known limitation in current codebase (D1 primary), but fallback to memory should happen.
    });

    it('KV 不可用 → 回退到环境变量默认仓库', async () => {
      const kv = { 
        get: async () => { throw new Error('KV down'); }, 
        put: async () => {}, 
        list: async () => { throw new Error('KV down'); } 
      };
      const env = { ...baseEnv, REPO_REGISTRY: kv };
      const result = await resolveForWrite(env, 100);
      expect(result.meta.id).toBe('fallback');
      expect(result.meta.owner).toBe('default-user');
      expect(result.token).toBe('default-token');
    });
  });

  describe('resolveForRead', () => {
    it('命中 path:: 精确索引 → 直接定位仓库', async () => {
      const kv = makeMockKV({
        'path::/images/test.jpg': JSON.stringify({ repoId: 'repo-b' }),
        'repo::repo-a': JSON.stringify({ id: 'repo-a', status: 'active', tokenSecretName: 'TOKEN_A' }),
        'repo::repo-b': JSON.stringify({ id: 'repo-b', status: 'active', tokenSecretName: 'TOKEN_B' }),
      });
      const env = { ...baseEnv, REPO_REGISTRY: kv, TOKEN_B: 'token-b' };
      const result = await resolveForRead('/images/test.jpg', env);
      expect(result.meta.id).toBe('repo-b');
      expect(result.token).toBe('token-b');
    });

    it('未命中索引但命中 read_rules 前缀 → 走前缀规则', async () => {
      const kv = makeMockKV({
        'route::read_rules': JSON.stringify([{ prefix: '/docs/', repo: 'repo-c' }]),
        'repo::repo-c': JSON.stringify({ id: 'repo-c', status: 'readonly', tokenSecretName: 'TOKEN_C' }),
      });
      const env = { ...baseEnv, REPO_REGISTRY: kv, TOKEN_C: 'token-c' };
      const result = await resolveForRead('/docs/readme.md', env);
      expect(result.meta.id).toBe('repo-c');
    });

    it('全部未命中 → 兜底到当前写仓库', async () => {
      const kv = makeMockKV({
        'route::current_write': 'repo-default',
        'repo::repo-default': JSON.stringify({ id: 'repo-default', status: 'active', tokenSecretName: 'TOKEN_D' }),
      });
      const env = { ...baseEnv, REPO_REGISTRY: kv, TOKEN_D: 'token-d' };
      const result = await resolveForRead('/unknown/path.jpg', env);
      expect(result.meta.id).toBe('repo-default');
    });
  });
});
