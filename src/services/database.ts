import { Bindings } from '../types/env';
import { RepoMeta } from './repoRouter';
import { ProviderConfig } from '../providers/types';

/**
 * Service for interacting with Cloudflare D1 SQL database.
 * Supports transactions and relative updates for consistency.
 */
export const dbService = {
  /**
   * Upsert a repository record (Idempotent for dual-write/backfill).
   */
  upsertRepo: async (db: D1Database, repo: RepoMeta) => {
    return await db.prepare(`
      INSERT INTO repos (id, owner, name, branch, status, capacity_limit_bytes, used_bytes, file_count, token_secret_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner = excluded.owner,
        name = excluded.name,
        branch = excluded.branch,
        status = excluded.status,
        capacity_limit_bytes = excluded.capacity_limit_bytes,
        used_bytes = excluded.used_bytes,
        file_count = excluded.file_count,
        token_secret_name = excluded.token_secret_name
    `).bind(
      repo.id,
      repo.owner,
      repo.name,
      repo.branch,
      repo.status,
      repo.capacityLimitBytes,
      repo.sizeBytes,
      repo.fileCount,
      repo.tokenSecretName
    ).run();
  },

  /**
   * Atomic capacity update and path insertion (Dual-write mutation).
   */
  recordFileAddition: async (db: D1Database, path: string, repoId: string, sizeBytes: number, hash?: string) => {
    const batch = [
      // 1. Update repo stats (Relative update to prevent race conditions)
      db.prepare(`
        UPDATE repos 
        SET used_bytes = used_bytes + ?, file_count = file_count + 1 
        WHERE id = ?
      `).bind(sizeBytes, repoId),
      
      // 2. Insert path mapping
      db.prepare(`
        INSERT INTO paths (path, repo_id, size_bytes, hash)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          repo_id = excluded.repo_id,
          size_bytes = excluded.size_bytes,
          hash = excluded.hash
      `).bind(path, repoId, sizeBytes, hash || null)
    ];
    return await db.batch(batch);
  },

  /**
   * Atomic capacity update and path deletion.
   */
  recordFileDeletion: async (db: D1Database, path: string, repoId: string, sizeBytes: number) => {
    const batch = [
      db.prepare(`
        UPDATE repos 
        SET used_bytes = MAX(0, used_bytes - ?), file_count = MAX(0, file_count - 1) 
        WHERE id = ?
      `).bind(sizeBytes, repoId),
      db.prepare(`DELETE FROM paths WHERE path = ?`).bind(path)
    ];
    return await db.batch(batch);
  },

  /**
   * Record audit log.
   */
  recordAudit: async (db: D1Database, action: string, user: string, ip: string, details: any) => {
    return await db.prepare(`
      INSERT INTO audit_logs (ts, action, user_email, ip, details)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      new Date().toISOString(),
      action,
      user,
      ip,
      JSON.stringify(details)
    ).run();
  },

  /**
   * Record system config.
   */
  setConfig: async (db: D1Database, key: string, value: string) => {
    return await db.prepare(`
      INSERT INTO system_config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  },

  /**
   * Upsert a migration task.
   */
  upsertTask: async (db: D1Database, task: any) => {
    return await db.prepare(`
      INSERT INTO migration_tasks (id, source_path, target_path, status, file_size, source_repo_id, target_repo_id, error, start_time, last_update)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        file_size = excluded.file_size,
        source_repo_id = excluded.source_repo_id,
        target_repo_id = excluded.target_repo_id,
        error = excluded.error,
        last_update = excluded.last_update
    `).bind(
      task.id,
      task.sourcePath,
      task.targetPath,
      task.status,
      task.fileSize || null,
      task.sourceRepoId || null,
      task.targetRepoId || null,
      task.error || null,
      new Date(task.startTime).toISOString(),
      new Date(task.lastUpdate).toISOString()
    ).run();
  },

  /**
   * Get a migration task by ID.
   */
  getTask: async (db: D1Database, taskId: string) => {
    const r: any = await db.prepare(`SELECT * FROM migration_tasks WHERE id = ?`).bind(taskId).first();
    if (!r) return null;
    return {
      id: r.id,
      sourcePath: r.source_path,
      targetPath: r.target_path,
      status: r.status,
      fileSize: r.file_size,
      sourceRepoId: r.source_repo_id,
      targetRepoId: r.target_repo_id,
      error: r.error,
      startTime: new Date(r.start_time).getTime(),
      lastUpdate: new Date(r.last_update).getTime(),
    };
  },

  /**
   * Upsert an auth token.
   */
  upsertToken: async (db: D1Database, token: string, name: string, createdAt: string, permissions: string[] = ['read', 'write', 'delete'], pathPrefix?: string, expiresAt?: string) => {
    return await db.prepare(`
      INSERT INTO auth_tokens (token, name, permissions, path_prefix, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        name = excluded.name,
        permissions = excluded.permissions,
        path_prefix = excluded.path_prefix,
        expires_at = excluded.expires_at
    `).bind(token, name, JSON.stringify(permissions), pathPrefix || null, createdAt, expiresAt || null).run();
  },

  /**
   * Get an auth token.
   */
  getToken: async (db: D1Database, token: string) => {
    const res: any = await db.prepare(`SELECT * FROM auth_tokens WHERE token = ?`).bind(token).first();
    if (!res) return null;
    return {
      token: res.token,
      name: res.name,
      permissions: res.permissions ? JSON.parse(res.permissions) : ['read', 'write', 'delete'],
      pathPrefix: res.path_prefix,
      createdAt: res.created_at,
      expiresAt: res.expires_at,
      lastUsedAt: res.last_used_at
    };
  },

  /**
   * Update token last used timestamp.
   */
  updateTokenLastUsed: async (db: D1Database, token: string) => {
    return await db.prepare(`UPDATE auth_tokens SET last_used_at = ? WHERE token = ?`)
      .bind(new Date().toISOString(), token).run();
  },

  /**
   * Get all repositories.
   */
  getAllRepos: async (db: D1Database): Promise<RepoMeta[]> => {
    const { results } = await db.prepare(`SELECT * FROM repos`).all();
    return results.map((r: any) => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      branch: r.branch,
      status: r.status,
      createdAt: r.created_at,
      sizeBytes: r.used_bytes,
      fileCount: r.file_count,
      capacityLimitBytes: r.capacity_limit_bytes,
      tokenSecretName: r.token_secret_name
    }));
  },

  /**
   * Get specific repository mapping for a path.
   */
  getPathRepoId: async (db: D1Database, path: string): Promise<string | null> => {
    const res: any = await db.prepare(`SELECT repo_id FROM paths WHERE path = ?`).bind(path).first();
    return res ? res.repo_id : null;
  },

  /**
   * Get system config value.
   */
  getConfig: async (db: D1Database, key: string): Promise<string | null> => {
    const res: any = await db.prepare(`SELECT value FROM system_config WHERE key = ?`).bind(key).first();
    return res ? res.value : null;
  },

  /**
   * Get recent audit logs, newest first.
   */
  getAuditLogs: async (db: D1Database, limit: number = 50) => {
    const { results } = await db.prepare(
      `SELECT ts, user_email, action, ip, details FROM audit_logs ORDER BY ts DESC LIMIT ?`
    ).bind(limit).all();
    return results.map((r: any) => {
      const row: Record<string, any> = {
        ts: r.ts,
        user: r.user_email,
        action: r.action,
        ip: r.ip,
      };
      const details = r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : {};
      for (const k of Object.keys(details)) {
        row[k] = details[k];
      }
      return row;
    });
  },

  /**
   * Get all storage providers from the `providers` table.
   */
  getAllProviders: async (db: D1Database): Promise<ProviderConfig[]> => {
    const { results } = await db.prepare(`SELECT * FROM providers`).all();
    return results.map((r: any) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      status: r.status,
      capacityLimitBytes: r.capacity_limit_bytes,
      usedBytes: r.used_bytes,
      fileCount: r.file_count,
      settings: JSON.parse(r.config || '{}'),
    }));
  },

  /**
   * Upsert a storage provider.
   */
  upsertProvider: async (db: D1Database, provider: ProviderConfig) => {
    return await db.prepare(`
      INSERT INTO providers (id, type, name, config, status, capacity_limit_bytes, used_bytes, file_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        config = excluded.config,
        status = excluded.status,
        capacity_limit_bytes = excluded.capacity_limit_bytes,
        used_bytes = excluded.used_bytes,
        file_count = excluded.file_count
    `).bind(
      provider.id,
      provider.type,
      provider.name,
      JSON.stringify(provider.settings),
      provider.status,
      provider.capacityLimitBytes,
      provider.usedBytes,
      provider.fileCount
    ).run();
  },

  /**
   * Record file addition with provider_id support.
   */
  recordFileAdditionV2: async (db: D1Database, path: string, providerId: string, sizeBytes: number, hash?: string, repoId?: string) => {
    const batch = [
      db.prepare(`
        UPDATE providers
        SET used_bytes = used_bytes + ?, file_count = file_count + 1
        WHERE id = ?
      `).bind(sizeBytes, providerId),
      db.prepare(`
        INSERT INTO path_providers (path, provider_id, repo_id, size_bytes, hash)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          provider_id = excluded.provider_id,
          repo_id = excluded.repo_id,
          size_bytes = excluded.size_bytes,
          hash = excluded.hash
      `).bind(path, providerId, repoId || null, sizeBytes, hash || null),
    ];
    return await db.batch(batch);
  },

  /**
   * Record file deletion with provider_id support.
   */
  recordFileDeletionV2: async (db: D1Database, path: string, providerId: string, sizeBytes: number) => {
    const batch = [
      db.prepare(`
        UPDATE providers
        SET used_bytes = MAX(0, used_bytes - ?), file_count = MAX(0, file_count - 1)
        WHERE id = ?
      `).bind(sizeBytes, providerId),
      db.prepare(`DELETE FROM path_providers WHERE path = ?`).bind(path),
    ];
    return await db.batch(batch);
  },

  /**
   * Get the provider_id for a given path from path_providers.
   */
  getPathProviderId: async (db: D1Database, path: string): Promise<string | null> => {
    const res: any = await db.prepare(`SELECT provider_id FROM path_providers WHERE path = ?`).bind(path).first();
    return res ? res.provider_id : null;
  }
};
