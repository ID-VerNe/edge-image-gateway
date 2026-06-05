import { z } from 'zod';
import { Bindings } from '../types/env';

export const envSchema = z.object({
  GITHUB_USER: z.string().min(1, 'GITHUB_USER is required'),
  GITHUB_REPO: z.string().min(1, 'GITHUB_REPO is required'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_BRANCH: z.string().default('main'),
  SIGN_SECRET: z.string().min(16, 'SIGN_SECRET must be at least 16 characters'),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(604800),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().optional().default(120),
  ENVIRONMENT: z.enum(['development', 'production']).default('production'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  CF_ZONE_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
}).superRefine((env, ctx) => {
  // Paired configuration validation
  const tgPaired = !!env.TELEGRAM_BOT_TOKEN === !!env.TELEGRAM_CHAT_ID;
  if (!tgPaired) {
    ctx.addIssue({ 
      code: 'custom', 
      path: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'], 
      message: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be provided together' 
    });
  }
  const cfPaired = !!env.CF_ZONE_ID === !!env.CF_API_TOKEN;
  if (!cfPaired) {
    ctx.addIssue({ 
      code: 'custom', 
      path: ['CF_ZONE_ID', 'CF_API_TOKEN'], 
      message: 'CF_ZONE_ID and CF_API_TOKEN must both be provided together' 
    });
  }
});

export function checkConfig(env: Bindings) {
  const result = envSchema.safeParse(env);
  return result.success
    ? { ok: true as const }
    : { 
        ok: false as const, 
        issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) 
      };
}
