export interface Bindings {
  GITHUB_USER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ALLOWED_REFERERS: string;
  CACHE_TTL_SECONDS: string;
  ENABLE_SIGNATURE: string;
  RATE_LIMIT_PER_MIN: string;

  // Secrets
  GITHUB_TOKEN: string;
  SIGN_SECRET: string;
}

export type AppEnvironment = {
  Bindings: Bindings;
};
