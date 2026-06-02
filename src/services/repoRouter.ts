import { Bindings } from '../types/env';

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

const ensureCache = async (env: Bindings) => {
  const now = Date.now();
  if (now - lastCacheTime < CACHE_TTL_MS && cachedRepos.size > 0) {
    return;
  }

  try {
    if (!env.REPO_REGISTRY) {
      // Graceful degradation if KV is not bound
      throw new Error('REPO_REGISTRY KVNamespace not bound');
    }

    const { keys } = await env.REPO_REGISTRY.list({ prefix: 'repo::' });
    const repoPromises = keys.map(key => env.REPO_REGISTRY.get<RepoMeta>(key.name, 'json'));
    const repos = await Promise.all(repoPromises);

    cachedRepos.clear();
    repos.forEach(repo => {
      if (repo) cachedRepos.set(repo.id, repo);
    });

    cachedReadRules = await env.REPO_REGISTRY.get<ReadRule[]>('route::read_rules', 'json');
    cachedCurrentWrite = await env.REPO_REGISTRY.get('route::current_write');
    
    lastCacheTime = now;
  } catch (err) {
    // If KV fails or is not bound, do nothing here and let the fallback handle it
    console.error('Failed to load repo registry from KV:', err);
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

export const resolveForRead = async (path: string, env: Bindings): Promise<ResolvedRepo> => {
  await ensureCache(env);

  if (cachedRepos.size === 0) {
    return getFallbackRepo(env);
  }

  if (cachedReadRules && cachedReadRules.length > 0) {
    // Ensure path starts with / for prefix matching if rules use it
    const matchPath = path.startsWith('/') ? path : `/${path}`;
    for (const rule of cachedReadRules) {
      if (matchPath.startsWith(rule.prefix)) {
        const repo = cachedRepos.get(rule.repo);
        if (repo) {
          return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
        }
      }
    }
  }

  // Fallback to current write repo or first available
  if (cachedCurrentWrite && cachedRepos.has(cachedCurrentWrite)) {
    const repo = cachedRepos.get(cachedCurrentWrite)!;
    return { meta: repo, token: getTokenFromEnv(env, repo.tokenSecretName) };
  }

  // If no rules matched and no write repo, just pick the first one
  const firstRepo = cachedRepos.values().next().value as RepoMeta;
  if (firstRepo) {
    return { meta: firstRepo, token: getTokenFromEnv(env, firstRepo.tokenSecretName) };
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
        if (env.REPO_REGISTRY) {
          await env.REPO_REGISTRY.put('route::current_write', repo.id);
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

export const listAllRepos = async (env: Bindings): Promise<RepoMeta[]> => {
  await ensureCache(env);
  if (cachedRepos.size === 0) {
    return [getFallbackRepo(env).meta];
  }
  return Array.from(cachedRepos.values());
};

export const getCurrentWriteId = async (env: Bindings): Promise<string> => {
  await ensureCache(env);
  return cachedCurrentWrite || 'fallback';
};
