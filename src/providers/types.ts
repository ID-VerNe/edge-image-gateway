/**
 * Provider architecture types for the Edge Image Gateway.
 *
 * Design references:
 * - flydrive DriverContract (19-method disk abstraction, key normalization, typed errors)
 * - voyant StorageProvider + StorageProviderResolver (logical name → physical store)
 * - storage-abstraction Adapter interface (plugin-based adapter registry)
 */

// ============================================================================
// Provider Interface
// ============================================================================

export type ProviderType = 'github' | 's3' | 'googledrive' | 'memory';

/** File metadata returned by providers */
export interface ProviderFile {
  path: string;
  name: string;
  size: number;
  sha?: string;          // GitHub-specific: blob SHA for delete operations
  mimeType?: string;
  lastModified?: string; // ISO string
}

/** Write operation options */
export interface ProviderWriteOptions {
  contentType?: string;
  message?: string;      // GitHub-specific: commit message
}

/** Read operation options */
export interface ProviderReadOptions {
  range?: { start?: number; end?: number };
}

/** List operation options */
export interface ProviderListOptions {
  recursive?: boolean;
  limit?: number;
  paginationToken?: string;
}

/**
 * StorageProvider — the core abstraction.
 *
 * Every storage backend (GitHub, S3/R2, Google Drive, memory) implements this
 * interface. The application code never imports a vendor SDK directly.
 */
export interface StorageProvider {
  /** Provider unique identifier (e.g. "github-main", "r2-cache") */
  readonly id: string;
  /** Provider type discriminator */
  readonly type: ProviderType;
  /** Human-readable name for the admin panel */
  readonly displayName: string;

  // ============ Core I/O ============

  /** Read file contents as ArrayBuffer. Returns null if not found. */
  getBytes(path: string, options?: ProviderReadOptions): Promise<ArrayBuffer | null>;

  /** Read file contents as a Web ReadableStream. Returns null if not found. */
  getStream(path: string, options?: ProviderReadOptions): Promise<ReadableStream | null>;

  /** Write a file. Overwrites if exists. */
  put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void>;

  /** Delete a file. No-op if file does not exist. */
  delete(path: string, sha?: string): Promise<void>;

  /** Check if a file exists. */
  exists(path: string): Promise<boolean>;

  // ============ Metadata & Management ============

  /** Get file metadata. Returns null if not found. */
  getFileInfo(path: string): Promise<ProviderFile | null>;

  /** List files, optionally filtered by prefix and recursive. */
  list(prefix?: string, options?: ProviderListOptions): Promise<ProviderFile[]>;

  /** Get provider usage statistics. */
  getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }>;

  // ============ Optional Features ============

  /** Get the public URL for a file. Optional — not all providers support it. */
  getUrl?(path: string): Promise<string>;

  /** Get a time-limited signed download URL. Optional. */
  getSignedUrl?(path: string, expiresInSeconds: number): Promise<string>;
}

// ============================================================================
// Provider Config (stored in D1 `providers` table)
// ============================================================================

export type ProviderStatus = 'active' | 'readonly' | 'draining' | 'archived';

/** Base provider configuration, as stored in D1. */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;         // Display name
  status: ProviderStatus;
  capacityLimitBytes: number;
  usedBytes: number;
  fileCount: number;
  // Provider-specific configuration stored as JSON in D1
  settings: Record<string, string>;
}

/** GitHub provider configuration */
export interface GitHubProviderSettings {
  owner: string;
  repo: string;
  branch: string;
  tokenSecretName: string;
}

/** S3-compatible provider configuration (for R2, MinIO, GCS XML API) */
export interface S3ProviderSettings {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
  supportsACL?: boolean;
}

/** Google Drive provider configuration */
export interface GoogleDriveProviderSettings {
  folderId?: string;
}

// ============================================================================
// Provider Resolver
// ============================================================================

/**
 * ProviderResolver — resolves logical paths to StorageProvider instances.
 *
 * Reference: voyant's StorageProviderResolver pattern.
 * Application code asks "which provider handles this path?" without knowing
 * whether the backend is GitHub, S3, or Google Drive.
 */
export interface ProviderResolver {
  /** Resolve the provider for reading a specific path. */
  resolveForRead(path: string): Promise<StorageProvider>;

  /** Resolve the provider for writing, optionally reserving space. */
  resolveForWrite(requiredBytes?: number): Promise<StorageProvider>;

  /** Get a provider by its ID. */
  getProvider(id: string): Promise<StorageProvider | null>;

  /** List all registered providers. */
  listProviders(): Promise<StorageProvider[]>;
}

// ============================================================================
// Errors
// ============================================================================

/** Base error for all provider operations */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly path?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(providerId: string) {
    super(`Provider "${providerId}" not found`, providerId);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderWriteError extends ProviderError {
  constructor(providerId: string, path: string, cause?: unknown) {
    super(`Cannot write file "${path}" on provider "${providerId}"`, providerId, path, { cause });
    this.name = 'ProviderWriteError';
  }
}

export class ProviderReadError extends ProviderError {
  constructor(providerId: string, path: string, cause?: unknown) {
    super(`Cannot read file "${path}" from provider "${providerId}"`, providerId, path, { cause });
    this.name = 'ProviderReadError';
  }
}

export class ProviderDeleteError extends ProviderError {
  constructor(providerId: string, path: string, cause?: unknown) {
    super(`Cannot delete file "${path}" from provider "${providerId}"`, providerId, path, { cause });
    this.name = 'ProviderDeleteError';
  }
}