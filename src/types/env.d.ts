export interface Bindings {
  // KV Namespace for Repo Registry
  REPO_REGISTRY: KVNamespace;

  // D1 Database for Structured Data
  DB: D1Database;

  // R2 Bucket for Variation Cache
  CACHE_BUCKET: R2Bucket;

  // Fallback / Default Repo Config (used if KV is not setup or empty)
  GITHUB_USER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_TOKEN: string;

  ALLOWED_REFERERS: string;
  CACHE_TTL_SECONDS: string;
  ENABLE_SIGNATURE: string;
  RATE_LIMIT_PER_MIN: string;
  APP_TITLE: string;
  APP_DESCRIPTION: string;
  EMERGENCY_LOCKDOWN: string; // "true" or "false"
  ADMIN_EMAILS: string; // comma-separated whitelist

  ANALYTICS_ENGINE?: AnalyticsEngineDataset;

  // Secrets
  SIGN_SECRET: string;
  ADMIN_TOTP_SECRET?: string;
  CF_ZONE_ID?: string;
  CF_API_TOKEN?: string;
  SENTRY_DSN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export type AppEnvironment = {
  Bindings: Bindings;
};
