import { describe, it, expect } from 'vitest';
import { envSchema } from '../../src/utils/configCheck';

describe('envSchema (Zod Config Validation)', () => {
  it('基础合法配置 → 校验通过', () => {
    const validEnv = {
      GITHUB_USER: 'test-user',
      GITHUB_REPO: 'test-repo',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'ghp_abc123',
      SIGN_SECRET: 'secret_key_123456',
      ENVIRONMENT: 'production',
      ENABLE_SIGNATURE: 'true'
    };

    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENVIRONMENT).toBe('production');
    }
  });

  it('缺失必填字段 (GITHUB_USER) → 校验失败', () => {
    const invalidEnv = {
      GITHUB_REPO: 'test-repo',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'ghp_abc123',
      SIGN_SECRET: 'secret_key_123456'
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errs = result.error.issues.map(e => e.path[0]);
      expect(errs).toContain('GITHUB_USER');
    }
  });

  it('默认值注入测试', () => {
    const envWithMissingOptionals = {
      GITHUB_USER: 'test-user',
      GITHUB_REPO: 'test-repo',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'ghp_abc123',
      SIGN_SECRET: 'secret_key_123456'
    };

    const result = envSchema.safeParse(envWithMissingOptionals);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENVIRONMENT).toBe('production');
      expect(result.data.RATE_LIMIT_PER_MIN).toBe(120);
      expect(result.data.CACHE_TTL_SECONDS).toBe(604800);
    }
  });

  it('成对配置校验：提供了 CF_API_TOKEN 但缺少 CF_ZONE_ID → 报错', () => {
    const env = {
      GITHUB_USER: 'test',
      GITHUB_REPO: 'test',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'ghp_abc123',
      SIGN_SECRET: 'secret_key_123456',
      CF_API_TOKEN: 'token_xxx'
      // Missing CF_ZONE_ID
    };

    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errMsg = result.error.issues[0].message;
      expect(errMsg).toBe('CF_ZONE_ID and CF_API_TOKEN must both be provided together');
    }
  });

  it('成对配置校验：提供了 TELEGRAM_BOT_TOKEN 但缺少 TELEGRAM_CHAT_ID → 报错', () => {
    const env = {
      GITHUB_USER: 'test',
      GITHUB_REPO: 'test',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'ghp_abc123',
      SIGN_SECRET: 'secret_key_123456',
      TELEGRAM_BOT_TOKEN: 'bot:123'
      // Missing TELEGRAM_CHAT_ID
    };

    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errMsg = result.error.issues[0].message;
      expect(errMsg).toBe('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be provided together');
    }
  });
});
