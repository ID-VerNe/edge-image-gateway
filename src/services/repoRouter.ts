import { Bindings } from '../types/env';
import { dbService } from './database';

export interface RepoMeta {
  id: string;
  owner: string;
  name: string;
  branch: string;
  status: 'active' | 'readonly' | 'draining' | 'archived';
  createdAt: string;
  sizeBytes: number;
  fileCount: number;
  capacityLimitBytes: number;
  tokenSecretName: string;
}

export interface ReadRule {
  prefix: string;
  repo: string;
  since?: string;
}

export interface ResolvedRepo {
  meta: RepoMeta;
  token: string;
}

// In-memory cache for Worker lifecycle
let cachedRepos: Map<string, RepoMeta> = new Map();
let cachedReadRules: ReadRule[] | null = null;
let cachedCurrentWrite: string | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000;

const ensureCache = async (env: Bindings, force: boolean = false) => {
  const now = Date.now();
  if (!force && now - lastCacheTime < CACHE_TTL_MS && cachedRepos.size > 0) {
    return;
  }

  try {
    let repos: RepoMeta[] = [];
    let readRules: ReadRule[] | null = null;
    let currentWrite: string | null = null;

    // Phase 3: D1 primary
    if (env.DB) {
      try {
        repos = await dbService.getAllRepos(env.DB);
        const rulesStr = await dbService.getConfig(env.DB, 'route::read_rules');
        readRules = rulesStr ? JSON.parse(rulesStr) : null;
        currentWrite = await dbService.getConfig(env.DB, 'route::current_write');
      } catch (e) {
        console.error('D1 cache load failed, trying KV:', e);
      }
    }

    // Fallback to KV if D1 failed or returned nothing (and KV exists)
    if (repos.length === 0 && env.REPO_REGISTRY) {
      const { keys } = await env.REPO_REGISTRY.list({ prefix: 'repo::' });
      const repoPromises = keys.map(key => env.REPO_REGISTRY.get<RepoMeta>(key.name, 'json'));
      const kvRepos = await Promise.all(repoPromises);
      repos = kvRepos.filter(Boolean) as RepoMeta[];
      readRules = await env.REPO_REGISTRY.get<ReadRule[]>('route::read_rules', 'json');
      currentWrite = await env.REPO_REGISTRY.get('route::current_write');
    }

    if (repos.length > 0) {
      cachedRepos.clear();
      repos.forEach(repo => cachedRepos.set(repo.id, repo));
      cachedReadRules = readRules;
      cachedCurrentWrite = currentWrite;
      lastCacheTime = now;
    }
  } catch (err) {
    console.error('Failed to load repo registry:', err);
  }
};

const getFallbackRepo = (env: Bindings): ResolvedRepo => {
  return {
    meta: {
      id: 'fallback',
      owner: env.GITHUB_USER,
      name: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH || 'main',
      status: 'active',
      createdAt: new Date().toISOString(),
      sizeBytes: 0,
      fileCount: 0,
      capacityLimitBytes: 5 * 1024 * 1024 * 1024, // 5GB default
      tokenSecretName: 'GITHUB_TOKEN',
    },
    token: env.GITHUB_TOKEN,
  };
};

export const getTokenFromEnv = (env: Bindings, tokenSecretName: string): string => {
  // Use index signature to get the token dynamically
  const token = (env as unknown as Record<string, string>)[tokenSecretName];
  return token || env.GITHUB_TOKEN; // fallback to default token
};

export interface PathRecord {
  repoId: string;
  hash?: string;
}

const getRepoIdFromRecord = (record: string | null): string | null => {
  if (!record) return null;
  if (record.startsWith('{')) {
    try {
      const parsed = JSON.parse(record) as PathRecord;
      return parsed.repoId;
    } catch {
      return record;
    }
  }
  return record;
};

export const invalidateRepoCache = () => {
  lastCacheTime = 0;
  cachedRepos.clear();
  cachedReadRules = null;
  cachedCurrentWrite = null;
};

export const backfillPathIndex = async (path: string, repoId: string, env: Bindings) => {
  // DISABLED: High KV write cost. Rule-based resolution is fast enough.
  /*
  if (!env.REPO_REGISTRY) return;
  try {
    // Check again to avoid unnecessary writes if another isolate did it
    const exists = await env.REPO_REGISTRY.get(`path::${path}`, { cacheTtl: 60 });
    if (!exists) {
      await env.REPO_REGISTRY.put(`path::${path}`, JSON.stringify({ repoId }));
      console.log(`Lazy-indexed path: ${path} -> ${repoId}`);
    }
  } catch (err) {
    console.error('Failed to backfill path index:', err);
  }
  */
};

export const resolveForRead = async (
  path: string, 
  env: Bindings, 
  waitUntil?: (promise: Promise<any>) => void
): Promise<ResolvedRepo> => {
  await ensureCache(env);

  if (cachedRepos.size === 0) {
    return getFallbackRepo(env);
  }

  // 1. Check exact path in D1 (Phase 3 primary)
  if (env.DB) {
    try {
      const repoId = await dbService.getPathRepoId(env.DB, path);
      if (repoId && cachedRepos.has(repoId)) {
        const repo = cachedRepos.get(repoId)!;
        return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
      }
    } catch (e) {
      console.error('D1 path resolution failed:', e);
    }
  }

  // 2. Fallback to KV for exact path mapping (transition phase)
  if (env.REPO_REGISTRY) {
    const record = await env.REPO_REGISTRY.get(`path::${path}`);
    const repoId = getRepoIdFromRecord(record);
    if (repoId && cachedRepos.has(repoId)) {
      const repo = cachedRepos.get(repoId)!;
      return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
    }

    // Prefix search in KV
    if (path) {
      const normalizedPath = path.endsWith('/') ? path : `${path}/`;
      const { keys } = await env.REPO_REGISTRY.list({ prefix: `path::${normalizedPath}`, limit: 1 });
      if (keys.length > 0) {
        const record = await env.REPO_REGISTRY.get(keys[0].name);
        const repoId = getRepoIdFromRecord(record);
        if (repoId && cachedRepos.has(repoId)) {
          const repo = cachedRepos.get(repoId)!;
          return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
        }
      }
    }
  }

  // 3. Check read rules
  let matchedRepoId: string | null = null;
  if (cachedReadRules && cachedReadRules.length > 0) {
    const matchPath = path.startsWith('/') ? path : `/${path}`;
    for (const rule of cachedReadRules) {
      if (matchPath.startsWith(rule.prefix)) {
        if (cachedRepos.has(rule.repo)) {
          matchedRepoId = rule.repo;
          break;
        }
      }
    }
  }

  // 4. Fallback to current write repo
  if (!matchedRepoId && cachedCurrentWrite && cachedRepos.has(cachedCurrentWrite)) {
    matchedRepoId = cachedCurrentWrite;
  }

  // 5. Final fallback: first available
  if (!matchedRepoId) {
    const firstRepo = cachedRepos.values().next().value as RepoMeta;
    if (firstRepo) matchedRepoId = firstRepo.id;
  }

  if (matchedRepoId && cachedRepos.has(matchedRepoId)) {
    const repo = cachedRepos.get(matchedRepoId)!;
    
    // BACKFILL: If we resolved via rules/fallback AND we have waitUntil, index it for next time.
    if (waitUntil && env.REPO_REGISTRY && path) {
      waitUntil(backfillPathIndex(path, matchedRepoId, env));
    }

    return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
  }

  return getFallbackRepo(env);
};

export const resolveForWrite = async (env: Bindings, requiredBytes: number = 0): Promise<ResolvedRepo> => {
  await ensureCache(env);

  if (cachedRepos.size === 0) {
    return getFallbackRepo(env);
  }

  let currentRepo: RepoMeta | undefined;
  if (cachedCurrentWrite && cachedRepos.has(cachedCurrentWrite)) {
    currentRepo = cachedRepos.get(cachedCurrentWrite);
  }

  // If current write repo is active and has space, use it
  if (currentRepo && currentRepo.status === 'active') {
    if (currentRepo.sizeBytes + requiredBytes <= currentRepo.capacityLimitBytes) {
      return { meta: currentRepo, token: getTokenFromEnv(env, currentRepo.tokenSecretName) };
    }
    
    // Current is full, try to find another active one with space
    for (const repo of cachedRepos.values()) {
      if (repo.id !== currentRepo.id && repo.status === 'active' && repo.sizeBytes + requiredBytes <= repo.capacityLimitBytes) {
        // Automatic switch to new repository with space
        if (env.DB) {
          await dbService.setConfig(env.DB, 'route::current_write', repo.id);
          cachedCurrentWrite = repo.id;
        }
        return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
      }
    }
  }

  // If current_write was not set or invalid, find any active repo
  if (!currentRepo || currentRepo.status !== 'active') {
    for (const repo of cachedRepos.values()) {
      if (repo.status === 'active') {
        // If we found an active one, check its space
        if (repo.sizeBytes + requiredBytes <= repo.capacityLimitBytes) {
          return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
        }
      }
    }
  }

  // Fallback: Return whatever we found as current write, or first repo, or fallback
  const finalRepo = currentRepo || cachedRepos.values().next().value as RepoMeta;
  if (finalRepo) {
    return { meta: finalRepo, token: getTokenFromEnv(env, finalRepo.tokenSecretName) };
  }

  return getFallbackRepo(env);
};

export const listAllRepos = async (env: Bindings, force: boolean = false): Promise<RepoMeta[]> => {
  await ensureCache(env, force);
  if (cachedRepos.size === 0) {
    return [getFallbackRepo(env).meta];
  }
  return Array.from(cachedRepos.values());
};

export const getRepoById = async (id: string, env: Bindings): Promise<ResolvedRepo | null> => {
  await ensureCache(env);
  if (id === 'fallback') {
    return getFallbackRepo(env);
  }
  
  if (cachedRepos.has(id)) {
    const repo = cachedRepos.get(id)!;
    return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
  }
  
  return null;
};

export const getCurrentWriteId = async (env: Bindings, force: boolean = false): Promise<string> => {
  await ensureCache(env, force);
  return cachedCurrentWrite || 'fallback';
};
