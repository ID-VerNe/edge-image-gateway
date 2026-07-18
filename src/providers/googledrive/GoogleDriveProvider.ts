import { Buffer } from 'node:buffer';
import { StorageProvider, ProviderFile, ProviderWriteOptions, ProviderReadOptions, ProviderListOptions, ProviderWriteError, ProviderReadError, ProviderDeleteError } from '../types';
import { GoogleDriveAuth, GoogleDriveAuthConfig } from './auth';
import { dbService } from '../../services/database';
import { logger } from '../../utils/logger';

/**
 * GoogleDriveProvider — implements StorageProvider via Google Drive REST API.
 *
 * Authentication: OAuth 2.0 with refresh_token (no npm deps).
 * Path resolution: Uses path_providers.external_id to map paths → fileId.
 * Folder hierarchy: Auto-creates on upload via a flat naming convention.
 *
 * Google Drive API docs: https://developers.google.com/drive/api/v3/reference
 */

export interface GoogleDriveProviderConfig {
  /** OAuth Client ID from Google Cloud Console */
  clientId: string;
  /** OAuth Client Secret */
  clientSecret: string;
  /** Long-lived refresh token (obtained via OAuth Playground) */
  refreshToken: string;
  /**
   * Root folder ID in Google Drive.
   * If set, all files go under this folder (e.g. "0B8VJ-gRi4t...")
   * If empty, uses "root" (My Drive).
   */
  folderId?: string;
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id: string;
  readonly type = 'googledrive' as const;
  readonly displayName: string;

  private auth: GoogleDriveAuth;
  private rootFolderId: string;
  private db: D1Database | null = null;

  /**
   * In-memory folder ID cache per Worker isolate.
   * Key: `parentId/name`, Value: Google Drive fileId
   * Lost when isolate recycles, which is fine — we fall back to D1 then API.
   */
  private folderCache = new Map<string, string>();

  constructor(id: string, config: GoogleDriveProviderConfig, db?: D1Database) {
    this.id = id;
    this.displayName = `Google Drive (${id})`;
    this.rootFolderId = config.folderId || 'root';
    this.db = db || null;

    this.auth = new GoogleDriveAuth({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    });
  }

  /** Set D1 database reference after construction (for path resolution). */
  setDb(db: D1Database): void {
    this.db = db;
  }

  // ============ Core I/O ============

  async getBytes(path: string, _options?: ProviderReadOptions): Promise<ArrayBuffer | null> {
    try {
      const fileId = await this.resolvePathToId(path);
      if (!fileId) return null;

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (resp.status === 404) return null;
      if (!resp.ok) {
        // Maybe the fileId is stale — clear cache mapping
        if (resp.status === 401) {
          // Token expired, will auto-refresh on next call
        }
        throw new Error(`Google Drive API returned ${resp.status}`);
      }

      return await resp.arrayBuffer();
    } catch (err: any) {
      if (err instanceof ProviderReadError) throw err;
      throw new ProviderReadError(this.id, path, err);
    }
  }

  async getStream(path: string, _options?: ProviderReadOptions): Promise<ReadableStream | null> {
    try {
      const fileId = await this.resolvePathToId(path);
      if (!fileId) return null;

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error(`Google Drive API returned ${resp.status}`);

      return resp.body;
    } catch (err: any) {
      if (err instanceof ProviderReadError) throw err;
      throw new ProviderReadError(this.id, path, err);
    }
  }

  async put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void> {
    try {
      const token = await this.auth.getAccessToken();
      const existingFileId = await this.resolvePathToId(path);
      const parentId = await this.ensureFolderHierarchy(path);
      const fileName = path.split('/').filter(Boolean).pop() || 'file';

      // Build multipart request body manually
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({
        name: fileName,
        parents: [parentId],
        ...(options?.contentType ? { mimeType: options.contentType } : {}),
      });

      // Convert data to Uint8Array for binary-safe concatenation
      let fileBytes: Uint8Array;
      if (typeof data === 'string') {
        fileBytes = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        fileBytes = new Uint8Array(data);
      } else {
        fileBytes = data;
      }

      // Build multipart body parts
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [
        encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
        encoder.encode(`--${boundary}\r\nContent-Type: ${options?.contentType || 'application/octet-stream'}\r\n\r\n`),
        fileBytes,
        encoder.encode(`\r\n--${boundary}--`),
      ];

      // Calculate total length
      const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const part of parts) {
        body.set(part, offset);
        offset += part.byteLength;
      }

      const uploadUrl = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const resp = await fetch(uploadUrl, {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(totalLength),
        },
        body,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Google Drive upload failed: ${resp.status} ${errText}`);
      }

      const result: any = await resp.json();
      const newFileId = result.id;

      // Record the fileId mapping in D1
      if (this.db) {
        try {
          const sizeBytes = fileBytes.byteLength;
          await dbService.recordFileAdditionV2(
            this.db, path, this.id, sizeBytes, undefined, undefined, newFileId
          );
        } catch (dbErr) {
          logger.error('gdrive_record_path_failed', { path, fileId: newFileId, error: String(dbErr) });
        }
      }
    } catch (err: any) {
      if (err instanceof ProviderWriteError) throw err;
      throw new ProviderWriteError(this.id, path, err);
    }
  }

  async delete(path: string, _sha?: string): Promise<void> {
    try {
      const fileId = await this.resolvePathToId(path);
      if (!fileId) return; // already gone

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (resp.status !== 204 && resp.status !== 404) {
        const errText = await resp.text();
        throw new Error(`Google Drive delete failed: ${resp.status} ${errText}`);
      }

      // Clean up D1 mapping
      if (this.db) {
        try {
          await this.db.prepare('DELETE FROM path_providers WHERE path = ?')
            .bind(path).run();
        } catch (dbErr) {
          logger.error('gdrive_delete_path_failed', { path, error: String(dbErr) });
        }
      }
    } catch (err: any) {
      if (err instanceof ProviderDeleteError) throw err;
      throw new ProviderDeleteError(this.id, path, err);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const fileId = await this.resolvePathToId(path);
      if (!fileId) return false;

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return resp.ok;
    } catch (err) {
      logger.error('gdrive_exists_failed', { path, error: String(err) });
      return false;
    }
  }

  // ============ Metadata & Management ============

  async getFileInfo(path: string): Promise<ProviderFile | null> {
    try {
      const fileId = await this.resolvePathToId(path);
      if (!fileId) return null;

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,modifiedTime`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) return null;
      const data: any = await resp.json();

      return {
        path,
        name: data.name,
        size: parseInt(data.size || '0', 10),
        mimeType: data.mimeType,
        lastModified: data.modifiedTime,
      };
    } catch (err) {
      logger.error('gdrive_fileinfo_failed', { path, error: String(err) });
      return null;
    }
  }

  async list(prefix?: string, _options?: ProviderListOptions): Promise<ProviderFile[]> {
    try {
      const token = await this.auth.getAccessToken();
      const folderId = prefix
        ? await this.resolveFolderPath(prefix)
        : this.rootFolderId;

      if (!folderId) return [];

      // List children of the folder
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?` +
        `q='${folderId}'+in+parents+and+trashed=false&` +
        `fields=files(id,name,size,mimeType,modifiedTime)&` +
        `orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) return [];
      const data: any = await resp.json();

      return (data.files || []).map((f: any) => ({
        path: prefix ? `${prefix.replace(/\/+$/, '')}/${f.name}` : f.name,
        name: f.name,
        size: parseInt(f.size || '0', 10),
        mimeType: f.mimeType,
        lastModified: f.modifiedTime,
      }));
    } catch (err) {
      logger.error('gdrive_list_failed', { prefix, error: String(err) });
      return [];
    }
  }

  async getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }> {
    try {
      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        return { usedBytes: 0, fileCount: 0, capacityBytes: 5 * 1024 * 1024 * 1024 };
      }

      const data: any = await resp.json();
      const quota = data.storageQuota || {};
      return {
        usedBytes: parseInt(quota.usage || '0', 10),
        fileCount: 0, // Drive API doesn't give file count in quota
        capacityBytes: parseInt(quota.limit || String(15 * 1024 * 1024 * 1024), 10),
      };
    } catch (err) {
      logger.error('gdrive_usage_failed', { error: String(err) });
      return { usedBytes: 0, fileCount: 0, capacityBytes: 5 * 1024 * 1024 * 1024 };
    }
  }

  async getUrl(path: string): Promise<string> {
    return `/${path}`;
  }

  async getSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { generateHMAC } = await import('../../utils/hmac');
    const { normalizePathForHMAC } = await import('../../utils/path');

    const normalizedPath = normalizePathForHMAC(path);
    if (!normalizedPath) throw new Error(`Invalid path for signing: ${path}`);

    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const message = `${normalizedPath}|${exp}`;
    const sig = await generateHMAC(message, (this.auth as any).constructor.name);
    // Note: HMAC signing uses SIGN_SECRET env var, which is set on the Worker

    return `${normalizedPath}?sig=${sig}&exp=${exp}`;
  }

  // ============ Internal: Path Resolution ============

  /**
   * Resolve a file path to a Google Drive fileId.
   * Checks: in-memory cache → D1 path_providers → Google Drive API query.
   */
  private async resolvePathToId(path: string): Promise<string | null> {
    // 1. Check D1 path_providers table
    if (this.db) {
      try {
        const row: any = await this.db.prepare(
          `SELECT external_id FROM path_providers WHERE path = ? AND provider_id = ?`
        ).bind(path, this.id).first();

        if (row?.external_id) {
          return row.external_id;
        }
      } catch {
        // external_id column may not exist yet — fall through
      }
    }

    return null;
  }

  /**
   * Ensure the folder hierarchy for a given path exists in Google Drive.
   * Returns the fileId of the parent folder.
   */
  private async ensureFolderHierarchy(path: string): Promise<string> {
    const parts = path.split('/').filter(Boolean);
    // Remove the filename (last segment)
    const folderParts = parts.slice(0, -1);

    if (folderParts.length === 0) {
      return this.rootFolderId;
    }

    let parentId = this.rootFolderId;
    for (const folderName of folderParts) {
      parentId = await this.ensureFolder(folderName, parentId);
    }
    return parentId;
  }

  /**
   * Ensure a single folder exists in Google Drive.
   * Creates it if not found.
   */
  private async ensureFolder(name: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}/${name}`;

    // 1. Check in-memory cache
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    // 2. Search Google Drive for existing folder
    const token = await this.auth.getAccessToken();
    const searchResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      `q=name='${name}'+and+'${parentId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&` +
      `fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (searchResp.ok) {
      const searchData: any = await searchResp.json();
      if (searchData.files?.length > 0) {
        const fileId = searchData.files[0].id;
        this.folderCache.set(cacheKey, fileId);
        return fileId;
      }
    }

    // 3. Folder doesn't exist — create it
    const createResp = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }
    );

    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error(`Failed to create folder "${name}": ${errText}`);
    }

    const createData: any = await createResp.json();
    this.folderCache.set(cacheKey, createData.id);
    return createData.id;
  }

  /**
   * Resolve a folder path to a Google Drive folder ID.
   */
  private async resolveFolderPath(path: string): Promise<string | null> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return this.rootFolderId;

    let parentId = this.rootFolderId;
    for (const name of parts) {
      const cacheKey = `${parentId}/${name}`;
      const cached = this.folderCache.get(cacheKey);
      if (cached) {
        parentId = cached;
        continue;
      }

      const token = await this.auth.getAccessToken();
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${name}'+and+'${parentId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&` +
        `fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) return null;
      const data: any = await resp.json();
      if (!data.files?.length) return null;

      this.folderCache.set(cacheKey, data.files[0].id);
      parentId = data.files[0].id;
    }

    return parentId;
  }
}