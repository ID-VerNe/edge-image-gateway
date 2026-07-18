import { StorageProvider, ProviderFile, ProviderWriteOptions, ProviderReadOptions, ProviderListOptions } from '../types';

/**
 * MemoryProvider — in-memory storage for development and testing.
 *
 * Reference: voyant's createLocalStorageProvider (in-memory Map-based).
 * All data is stored in a Map and lost when the Worker isolates are recycled.
 */
export class MemoryProvider implements StorageProvider {
  readonly id: string;
  readonly type = 'memory' as const;
  readonly displayName: string;

  private store: Map<string, { bytes: Uint8Array; contentType?: string }> = new Map();
  private byteCount = 0;

  constructor(id: string, displayName?: string) {
    this.id = id;
    this.displayName = displayName || `memory:${id}`;
  }

  async getBytes(path: string, _options?: ProviderReadOptions): Promise<ArrayBuffer | null> {
    const record = this.store.get(path);
    if (!record) return null;
    // Return a copy to prevent mutation of internal store
    return record.bytes.slice(0).buffer as ArrayBuffer;
  }

  async getStream(path: string, _options?: ProviderReadOptions): Promise<ReadableStream | null> {
    const record = this.store.get(path);
    if (!record) return null;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(record!.bytes.slice(0));
        controller.close();
      },
    });
  }

  async put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void> {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else {
      bytes = data;
    }

    // Track size changes
    const existing = this.store.get(path);
    if (existing) {
      this.byteCount -= existing.bytes.length;
    }
    this.byteCount += bytes.length;

    this.store.set(path, { bytes, contentType: options?.contentType });
  }

  async delete(_path: string, _sha?: string): Promise<void> {
    const existing = this.store.get(_path);
    if (existing) {
      this.byteCount -= existing.bytes.length;
    }
    this.store.delete(_path);
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }

  async getFileInfo(path: string): Promise<ProviderFile | null> {
    const record = this.store.get(path);
    if (!record) return null;
    const name = path.split('/').pop() || path;
    return {
      path,
      name,
      size: record.bytes.length,
      mimeType: record.contentType,
    };
  }

  async list(prefix?: string, _options?: ProviderListOptions): Promise<ProviderFile[]> {
    const files: ProviderFile[] = [];
    for (const [path, record] of this.store.entries()) {
      if (prefix && !path.startsWith(prefix)) continue;
      const name = path.split('/').pop() || path;
      files.push({
        path,
        name,
        size: record.bytes.length,
        mimeType: record.contentType,
      });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }> {
    return {
      usedBytes: this.byteCount,
      fileCount: this.store.size,
      capacityBytes: 100 * 1024 * 1024, // 100MB default
    };
  }

  /** Clear all data (for testing). */
  clear(): void {
    this.store.clear();
    this.byteCount = 0;
  }
}