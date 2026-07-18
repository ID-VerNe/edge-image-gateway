import { StorageProvider, ProviderResolver, ProviderConfig } from './types';
import { GitHubProvider, GitHubProviderConfig } from './github/GitHubProvider';
import { GoogleDriveProvider, GoogleDriveProviderConfig } from './googledrive/GoogleDriveProvider';
import { dbService } from '../services/database';
import { invalidateRepoCache } from '../services/repoRouter';
import type { Bindings } from '../types/env';
import { logger } from '../utils/logger';

/**
 * ProviderRegistry — manages all StorageProvider instances.
 *
 * Responsibilities:
 * - Load providers from D1 on startup and cache them in memory
 * - Resolve providers for read/write operations
 * - Provider auto-discovery and lifecycle
 *
 * Reference patterns:
 * - flydrive's DriveManager (named disk registry with caching)
 * - voyant's StorageProviderResolver (logical name → provider)
 * - storage-abstraction's adapter registry (type → adapter class)
 */
export class ProviderRegistry implements ProviderResolver {
  private providers: Map<string, StorageProvider> = new Map();
  private currentWriteId: string | null = null;
  private readRules: { prefix: string; providerId: string }[] | null = null;
  private lastLoadTime = 0;
  private loadPromise: Promise<void> | null = null;

  private readonly CACHE_TTL_MS = 30 * 1000;

  /**
   * Load all providers from D1.
   * Uses a 30-second TTL cache per Worker isolate.
   */
  async loadFromD1(db: D1Database, env: Bindings, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastLoadTime < this.CACHE_TTL_MS && this.providers.size > 0) {
      return;
    }

    // Deduplicate concurrent loads
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        // Load repos from D1 (backward compatible: repos become GitHub providers)
        const repos = await dbService.getAllRepos(db);
        const newProviders = new Map<string, StorageProvider>();

        for (const repo of repos) {
          const config: GitHubProviderConfig = {
            owner: repo.owner,
            repo: repo.name,
            branch: repo.branch,
            tokenSecretName: repo.tokenSecretName,
          };
          const provider = new GitHubProvider(repo.id, config, env);
          newProviders.set(provider.id, provider);
        }

        // Also load from `providers` table if it exists (for future non-GitHub providers)
        try {
          const { results } = await db.prepare(`SELECT * FROM providers`).all();
          for (const row of results as any[]) {
            // Skip if already loaded from repos table
            if (newProviders.has(row.id)) continue;

            const settings = JSON.parse(row.config || '{}');
            let provider: StorageProvider | null = null;

            switch (row.type) {
              case 'github':
                provider = new GitHubProvider(row.id, settings as GitHubProviderConfig, env);
                break;
              case 'googledrive':
                provider = new GoogleDriveProvider(row.id, {
                  clientId: settings.clientId || env?.GOOGLE_DRIVE_CLIENT_ID || '',
                  clientSecret: settings.clientSecret || env?.GOOGLE_DRIVE_CLIENT_SECRET || '',
                  refreshToken: settings.refreshToken || env?.GOOGLE_DRIVE_REFRESH_TOKEN || '',
                  folderId: settings.folderId || undefined,
                } as GoogleDriveProviderConfig, db);
                break;
              // Future: case 's3' → S3Provider
            }

            if (provider) {
              newProviders.set(provider.id, provider);
            }
          }
        } catch {
          // providers table may not exist yet — that's fine
        }

        // Load configuration
        const currentWrite = await dbService.getConfig(db, 'route::current_write');
        const rulesStr = await dbService.getConfig(db, 'route::read_rules');
        const readRules: { prefix: string; providerId: string }[] = rulesStr
          ? JSON.parse(rulesStr).map((r: any) => ({ prefix: r.prefix, providerId: r.repo }))
          : [];

        // Only swap if we got data
        if (newProviders.size > 0) {
          this.providers = newProviders;
          this.currentWriteId = currentWrite;
          this.readRules = readRules;
          this.lastLoadTime = Date.now();
        }
      } catch (err) {
        logger.error('registry_load_failed', { error: String(err) });
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  // ============ ProviderResolver Implementation ============

  async resolveForRead(path: string): Promise<StorageProvider> {
    if (this.providers.size === 0) {
      throw new Error('No providers loaded');
    }

    // 1. Try to find the provider from the paths table (if we have DB access)
    // (The caller should pass env.DB — we don't hold it here)

    // 2. Check read rules
    if (this.readRules && this.readRules.length > 0) {
      for (const rule of this.readRules) {
        if (path.startsWith(rule.prefix) && this.providers.has(rule.providerId)) {
          return this.providers.get(rule.providerId)!;
        }
      }
    }

    // 3. Fallback to current write provider
    if (this.currentWriteId && this.providers.has(this.currentWriteId)) {
      return this.providers.get(this.currentWriteId)!;
    }

    // 4. Fallback to first available
    const first = this.providers.values().next().value;
    if (first) return first;

    throw new Error('No provider available');
  }

  async resolveForWrite(requiredBytes?: number): Promise<StorageProvider> {
    if (this.providers.size === 0) {
      throw new Error('No providers loaded');
    }

    // Try current write provider first
    if (this.currentWriteId) {
      const current = this.providers.get(this.currentWriteId);
      if (current) return current;
    }

    // Fallback to first active provider
    const first = this.providers.values().next().value;
    if (first) return first;

    throw new Error('No writable provider available');
  }

  async getProvider(id: string): Promise<StorageProvider | null> {
    return this.providers.get(id) || null;
  }

  async listProviders(): Promise<StorageProvider[]> {
    return Array.from(this.providers.values());
  }

  // ============ Management ============

  /** Register a provider manually (for testing). */
  register(provider: StorageProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Invalidate the cache so the next load refreshes from D1. */
  invalidate(): void {
    this.lastLoadTime = 0;
    this.loadPromise = null;
  }

  /** Get current write provider ID. */
  getCurrentWriteId(): string | null {
    return this.currentWriteId;
  }
}

/**
 * Global singleton registry instance.
 * Each Worker isolate gets its own instance with its own 30s TTL cache.
 */
let globalRegistry: ProviderRegistry | null = null;

/**
 * Get or create the global ProviderRegistry singleton.
 */
export function getRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing or cache invalidation).
 */
export function resetRegistry(): void {
  globalRegistry = null;
  invalidateRepoCache();
}

/**
 * Initialize the registry from D1.
 * Call this during Worker startup.
 */
export async function initRegistry(db: D1Database, env: Bindings): Promise<ProviderRegistry> {
  const registry = getRegistry();
  await registry.loadFromD1(db, env);
  return registry;
}

/**
 * Compatibility helper: get a GitHubProvider as a ResolvedRepo-like object.
 * Used by the existing repoRouter.ts fallback path.
 */
export async function resolveForReadViaRegistry(
  path: string,
  db: D1Database,
  env: Bindings
): Promise<{ provider: StorageProvider; isGitHub: boolean }> {
  const registry = getRegistry();
  await registry.loadFromD1(db, env);
  const provider = await registry.resolveForRead(path);
  return { provider, isGitHub: provider.type === 'github' };
}