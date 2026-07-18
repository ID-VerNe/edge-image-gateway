import { GoogleDriveAuth } from './auth';

/**
 * Simple in-memory cache for drive file/folder IDs.
 * Key: parentId/name, Value: fileId
 * Per-isolate cache, lost when Worker recycles (~minutes to hours).
 */
interface FolderCache {
  [key: string]: string;
}

// Provider gets a fresh instance per Worker isolate, so this cache is safe
export function createFolderCache(): FolderCache {
  return {};
}