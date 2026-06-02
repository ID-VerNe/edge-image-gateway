export interface Bindings {
  // KV Namespace for Repo Registry
  REPO_REGISTRY: KVNamespace;

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

  // Secrets
  SIGN_SECRET: string;
  ADMIN_TOTP_SECRET?: string;
  CF_ZONE_ID?: string;
  CF_API_TOKEN?: string;
}

export type AppEnvironment = {
  Bindings: Bindings;
};
