export interface Bindings {
  // KV Namespace for Repo Registry (DEPRECATED — no longer used, all data is D1-only).
  // Kept in type for backward compatibility; remove from wrangler.toml bindings.
  REPO_REGISTRY?: KVNamespace;

  // D1 Database for Structured Data
  DB: D1Database;

  // R2 Bucket for Variation Cache
  CACHE_BUCKET: R2Bucket;

  // Service binding to image-resize-worker (pure-JS resize pipeline).
  // Replaces paid Cloudflare Image Resizing (cf.image) which 502s when
  // the zone is not subscribed.
  // NOTE: For 24MP images, the Workers free plan 10ms CPU limit is too
  // restrictive. The fallback PHP resize endpoint is used instead — set
  // RESIZE_PHP_URL to the URL of your PHP resize server.
  IMAGE_RESIZE_WORKER: Fetcher;

  // URL of the PHP image resize server (e.g.
  // "https://your-server.com/resize.php"). When set, img-proxy will POST
  // image bytes to this URL instead of using the service binding. This
  // bypasses the Workers 10ms CPU limit for large images.
  RESIZE_PHP_URL?: string;

  // Shared secret for the image-resize-worker auth gate. Injected as
  // X-Api-Key on every service-binding call. Must match the worker's
  // RESIZE_API_KEY secret.
  RESIZE_API_KEY?: string;

  // Fallback / Default Repo Config (used if KV is not setup or empty)
  GITHUB_USER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GITHUB_TOKEN: string;

  ENVIRONMENT: string;

  ALLOWED_REFERERS: string;
  CACHE_TTL_SECONDS: string;
  ENABLE_SIGNATURE: string;
  RATE_LIMIT_PER_MIN: string;
  ADMIN_RATE_LIMIT_PER_MIN?: string;
  APP_TITLE: string;
  APP_DESCRIPTION: string;
  APP_URL?: string;
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
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  GOOGLE_DRIVE_REFRESH_TOKEN?: string;
}

export type AppEnvironment = {
  Bindings: Bindings;
  Variables: {
    tokenInfo?: any;
    user?: { email: string } | any;
  };
};
