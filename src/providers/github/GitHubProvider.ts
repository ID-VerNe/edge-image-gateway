import { Buffer } from 'node:buffer';
import { StorageProvider, ProviderFile, ProviderWriteOptions, ProviderReadOptions, ProviderListOptions, ProviderWriteError, ProviderReadError, ProviderDeleteError } from '../types';
import { GitHubService } from '../../services/github';
import { getTokenFromEnv } from '../../services/repoRouter';
import { logger } from '../../utils/logger';
import { getMimeType } from '../../utils/mime';
import type { Bindings } from '../../types/env';

export interface GitHubProviderConfig {
  owner: string;
  repo: string;
  branch: string;
  tokenSecretName: string;
}

/**
 * GitHubProvider — wraps the existing GitHubService with the StorageProvider interface.
 *
 * This is the bridge between the legacy repoRouter-based code and the new
 * provider architecture. All existing githubService methods are preserved
 * and called internally.
 */
export class GitHubProvider implements StorageProvider {
  readonly id: string;
  readonly type = 'github' as const;
  readonly displayName: string;

  private service: GitHubService;
  private config: GitHubProviderConfig;
  private env: Bindings;

  constructor(id: string, config: GitHubProviderConfig, env: Bindings) {
    this.id = id;
    this.config = config;
    this.env = env;
    this.displayName = `${config.owner}/${config.repo}`;
    this.service = new GitHubService();
  }

  // ============ Internal Helpers ============

  /**
   * Build a ResolvedRepo-like object for the GitHubService.
   * This bridges the old service interface with the new provider abstraction.
   */
  private getRepoMeta() {
    return {
      id: this.id,
      owner: this.config.owner,
      name: this.config.repo,
      branch: this.config.branch,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      sizeBytes: 0,
      fileCount: 0,
      capacityLimitBytes: 0,
      tokenSecretName: this.config.tokenSecretName,
    };
  }

  private getRepo() {
    return {
      meta: this.getRepoMeta(),
      token: getTokenFromEnv(this.env, this.config.tokenSecretName),
    };
  }

  /** Convert a GitHubItem to a ProviderFile */
  private toProviderFile(item: { name: string; path: string; size: number; sha?: string; type?: string; mimeType?: string }): ProviderFile {
    return {
      path: item.path,
      name: item.name,
      size: item.size,
      sha: item.sha,
      mimeType: item.mimeType || getMimeType(item.path),
    };
  }

  // ============ Core I/O ============

  async getBytes(path: string, _options?: ProviderReadOptions): Promise<ArrayBuffer | null> {
    try {
      const repo = this.getRepo();
      const resp = await this.service.fetchRaw(path, repo, undefined, this.env);
      if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error(`GitHub API returned ${resp.status}`);
      }
      return await resp.arrayBuffer();
    } catch (err: any) {
      if (err instanceof ProviderReadError) throw err;
      throw new ProviderReadError(this.id, path, err);
    }
  }

  async getStream(path: string, _options?: ProviderReadOptions): Promise<ReadableStream | null> {
    try {
      const repo = this.getRepo();
      const resp = await this.service.fetchRaw(path, repo, undefined, this.env);
      if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error(`GitHub API returned ${resp.status}`);
      }
      return resp.body;
    } catch (err: any) {
      if (err instanceof ProviderReadError) throw err;
      throw new ProviderReadError(this.id, path, err);
    }
  }

  async put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void> {
    try {
      const repo = this.getRepo();
      let base64: string;
      if (typeof data === 'string') {
        base64 = Buffer.from(data).toString('base64');
      } else if (data instanceof Uint8Array) {
        base64 = Buffer.from(data.buffer).toString('base64');
      } else {
        base64 = Buffer.from(data).toString('base64');
      }

      const message = options?.message || `Upload ${path} via Edge Image Gateway`;
      const resp = await this.service.putFile(path, repo, base64, message, this.env);
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`GitHub API returned ${resp.status}: ${errText}`);
      }
    } catch (err: any) {
      if (err instanceof ProviderWriteError) throw err;
      throw new ProviderWriteError(this.id, path, err);
    }
  }

  async delete(path: string, sha?: string): Promise<void> {
    try {
      const repo = this.getRepo();

      // If no sha provided, fetch it first
      let fileSha = sha;
      if (!fileSha) {
        const fileInfo = await this.service.getFile(path, repo, this.env);
        if (!fileInfo || Array.isArray(fileInfo)) return; // already gone
        fileSha = fileInfo.sha;
      }

      const message = `Delete ${path} via Admin UI`;
      const resp = await this.service.deleteFile(path, repo, fileSha, message, this.env);
      if (!resp.ok && resp.status !== 404) {
        const errText = await resp.text();
        throw new Error(`GitHub API returned ${resp.status}: ${errText}`);
      }
    } catch (err: any) {
      if (err instanceof ProviderDeleteError) throw err;
      throw new ProviderDeleteError(this.id, path, err);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const repo = this.getRepo();
      return await this.service.fileExists(path, repo, this.env);
    } catch (err) {
      logger.error('provider_exists_failed', { provider: this.id, path, error: String(err) });
      return false;
    }
  }

  // ============ Metadata & Management ============

  async getFileInfo(path: string): Promise<ProviderFile | null> {
    try {
      const repo = this.getRepo();
      const data = await this.service.getFile(path, repo, this.env);
      if (!data || Array.isArray(data)) return null;
      return this.toProviderFile(data);
    } catch (err) {
      logger.error('provider_fileinfo_failed', { provider: this.id, path, error: String(err) });
      return null;
    }
  }

  async list(prefix?: string, options?: ProviderListOptions): Promise<ProviderFile[]> {
    try {
      const repo = this.getRepo();
      const treeData = await this.service.getTree(repo, options?.recursive ?? true, this.env);
      if (!treeData || !treeData.tree) return [];

      let items = treeData.tree.filter((item: any) => item.type === 'blob');

      // Filter by prefix
      if (prefix) {
        const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
        items = items.filter((item: any) => item.path === prefix || item.path.startsWith(normalizedPrefix));
      }

      return items.map((item: any) => this.toProviderFile(item));
    } catch (err) {
      logger.error('provider_list_failed', { provider: this.id, prefix, error: String(err) });
      return [];
    }
  }

  async getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }> {
    // This data is stored in D1, not on GitHub directly.
    // The caller should resolve from D1; this is a fallback.
    try {
      const repo = this.getRepo();
      const treeData = await this.service.getTree(repo, true, this.env);
      if (!treeData || !treeData.tree) {
        return { usedBytes: 0, fileCount: 0, capacityBytes: 5 * 1024 * 1024 * 1024 };
      }
      const files = treeData.tree.filter((item: any) => item.type === 'blob');
      const totalBytes = files.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
      return { usedBytes: totalBytes, fileCount: files.length, capacityBytes: 5 * 1024 * 1024 * 1024 };
    } catch (err) {
      logger.error('provider_usage_failed', { provider: this.id, error: String(err) });
      return { usedBytes: 0, fileCount: 0, capacityBytes: 5 * 1024 * 1024 * 1024 };
    }
  }

  // ============ Optional Features ============

  async getUrl(path: string): Promise<string> {
    // Return the relative URL (works with the current domain)
    return `/${path}`;
  }

  async getSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    // Reuse the existing HMAC signing mechanism
    const { generateHMAC } = await import('../../utils/hmac');
    const { normalizePathForHMAC } = await import('../../utils/path');

    const normalizedPath = normalizePathForHMAC(path);
    if (!normalizedPath) throw new Error(`Invalid path for signing: ${path}`);

    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const message = `${normalizedPath}|${exp}`;
    const sig = await generateHMAC(message, this.env.SIGN_SECRET);

    return `${normalizedPath}?sig=${sig}&exp=${exp}`;
  }
}