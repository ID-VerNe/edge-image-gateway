import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../../types/env';
import { resolveForRead, resolveForWrite, RepoMeta } from '../../../../services/repoRouter';
import { githubService } from '../../../../services/github';
import { purgeFileCache } from '../../../../utils/cache';
import { logger } from '../../../../utils/logger';
import { dbService } from '../../../../services/database';
import { normalizePath } from '../../../../utils/path';
import { checkPathPrefix } from '../../../../middleware/adminAuth';

const mutateApi = new Hono<AppEnvironment>();

const MAX_DELETE_BATCH = 50;

const isAdminUser = (c: any): boolean => {
  const user = c.get('user');
  return user && !user.email.startsWith('token:');
};

mutateApi.post('/mkdir', async (c) => {
  try {
    const body = await c.req.json() as any;
    let path = (body.path || '').replace(/^\/+|\/+$/g, '');
    if (!path) return c.json({ error: 'Path is required' }, 400);
    if (!normalizePath('/' + path)) return c.json({ error: 'Invalid path or path traversal detected' }, 400);

    const tokenInfo = c.get('tokenInfo' as any);
    const prefixCheck = checkPathPrefix(tokenInfo, path);
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

    const fullPath = `${path}/.keep`;
    const repo = await resolveForWrite(c.env);

    const githubRes = await githubService.putFile(
      fullPath,
      repo,
      Buffer.from('Folder kept alive by Edge Image Gateway').toString('base64'),
      `Create folder ${path} via Admin UI`
    );

    if (!githubRes.ok) {
      return c.json({ error: 'Failed to create folder' }, 500);
    }

    if (c.env.DB) {
      await dbService.recordFileAddition(c.env.DB, fullPath, repo.meta.id, 0);
      await dbService.upsertRepo(c.env.DB, repo.meta);
    }

    c.executionCtx.waitUntil(logger.recordAudit(c, 'MKDIR', { path }));

    return c.json({ success: true, path });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'mkdir_failed' });
    return c.json({ error: 'Failed to create folder' }, 500);
  }
});

mutateApi.delete('/*', async (c) => {
  try {
    const reqUrl = new URL(c.req.url);
    let path = decodeURIComponent(reqUrl.pathname.replace('/admin/api/files/', ''));
    path = path.replace(/^\/+|\/+$/g, '');

    if (!normalizePath('/' + path)) {
      return c.json({ error: 'Invalid path or path traversal detected' }, 400);
    }

    const tokenInfo = c.get('tokenInfo' as any);
    const prefixCheck = checkPathPrefix(tokenInfo, path || '/');
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

    const isDir = c.req.query('type') === 'dir';
    const confirm = c.req.query('confirm');
    const repo = await resolveForRead(path, c.env);

    if (isDir) {
      if (!path) {
        return c.json({ error: 'Empty path deletion is not allowed. Specify a directory path.' }, 400);
      }
      if (confirm !== 'true') {
        return c.json({ error: 'Directory deletion requires confirm=true parameter' }, 400);
      }

      const treeData = await githubService.getTree(repo, true);
      if (!treeData) return c.json({ error: 'Failed to fetch repository tree' }, 500);

      const prefix = path ? `${path}/` : '';
      const itemsToDelete = treeData.tree.filter((item: any) =>
        item.type === 'blob' && (item.path === path || item.path.startsWith(prefix))
      );

      if (itemsToDelete.length > MAX_DELETE_BATCH) {
        return c.json({
          error: `Too many files to delete (${itemsToDelete.length}). Maximum is ${MAX_DELETE_BATCH} per request.`
        }, 400);
      }

      let deletedCount = 0;
      let deletedBytes = 0;
      for (const item of itemsToDelete) {
        const itemPrefixCheck = checkPathPrefix(tokenInfo, item.path);
        if (!itemPrefixCheck.ok) continue;

        const delRes = await githubService.deleteFile(
          item.path,
          repo,
          item.sha,
          `Delete ${item.path} (recursive dir delete) via Admin UI`
        );
        if (delRes.ok) {
          deletedCount++;
          deletedBytes += item.size || 0;
        }
      }

      if (deletedCount > 0 && c.env.DB) {
        const batch = [
          c.env.DB.prepare(`UPDATE repos SET used_bytes = MAX(0, used_bytes - ?), file_count = MAX(0, file_count - ?) WHERE id = ?`).bind(deletedBytes, deletedCount, repo.meta.id),
          ...itemsToDelete.slice(0, deletedCount).map((item: any) => c.env.DB.prepare(`DELETE FROM paths WHERE path = ?`).bind(item.path))
        ];
        await c.env.DB.batch(batch);
      }

      c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_DIR', { path, deletedCount }));
      return c.json({ success: true, deletedCount });
    }

    const fileData = await githubService.getFile(path, repo);
    if (!fileData || Array.isArray(fileData)) return c.json({ error: 'File not found' }, 404);

    const delRes = await githubService.deleteFile(
      path,
      repo,
      fileData.sha,
      `Delete ${path} via Admin UI`
    );

    if (!delRes.ok) {
      return c.json({ error: 'Failed to delete file' }, 500);
    }

    if (c.env.DB) {
      await dbService.recordFileDeletion(c.env.DB, path, repo.meta.id, fileData.size || 0);
    }

    c.executionCtx.waitUntil(purgeFileCache(path, c.env, new URL(c.req.url).origin));
    c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_FILE', { path }));

    return c.json({ success: true, path });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'delete_failed' });
    return c.json({ error: 'Failed to delete' }, 500);
  }
});

export interface MigrationTask {
  id: string;
  sourcePath: string;
  targetPath: string;
  status: 'pending' | 'copied' | 'verified' | 'src_deleted' | 'indexed' | 'done' | 'failed';
  error?: string;
  startTime: number;
  lastUpdate: number;
  fileSize?: number;
  sourceRepoId?: string;
  targetRepoId?: string;
  createdBy?: string;
}

const MIGRATION_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;

const retry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
  let lastErr: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (attempt < MAX_RETRIES - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('migration_retry', { label, attempt: attempt + 1, delay, error: e.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
};

const runWithTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Migration timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeout,
  ]);
};

const runMigration = async (taskId: string, c: any) => {
  const db = c.env.DB;

  const persistTask = async (task: MigrationTask) => {
    if (db) {
      try {
        await dbService.upsertTask(db, task);
      } catch (e: any) {
        logger.error('d1_persist_task_failed', { id: taskId, error: e.message });
      }
    }
  };

  let task: MigrationTask | null = null;

  try {
    task = null;
    if (db) {
      try {
        task = await dbService.getTask(db, taskId) as MigrationTask | null;
      } catch (e) { /* fallback below */ }
    }

    if (!task) return;

    const t = task!;

    await runWithTimeout((async () => {

      if (t.status === 'pending') {
        const sourceRepo = await retry(() => resolveForRead(t.sourcePath, c.env), 'resolveForRead');
        const sourceData = await retry(async () => {
          const data = await githubService.getFile(t.sourcePath, sourceRepo);
          if (!data || Array.isArray(data)) throw new Error('Source file not found');
          return data;
        }, 'getFile');
        const content = (sourceData as any).content;
        const fileSize = sourceData.size || 0;
        const targetRepo = await retry(() => resolveForWrite(c.env, fileSize), 'resolveForWrite');

        const putRes = await retry(async () => {
          const res = await githubService.putFile(
            t.targetPath,
            targetRepo,
            content,
            `Move ${t.sourcePath} (Task: ${taskId})`
          );
          if (!res.ok) throw new Error(`Copy failed: ${await res.text()}`);
          return res;
        }, 'putFile');

        task!.status = 'copied';
        task!.lastUpdate = Date.now();
        task!.fileSize = fileSize;
        task!.sourceRepoId = sourceRepo.meta.id;
        task!.targetRepoId = targetRepo.meta.id;
        await persistTask(task!);
      }

      if (t.status === 'copied') {
        const targetRepo = await retry(() => resolveForRead(t.targetPath, c.env), 'resolveForRead(verify)');
        const targetData = await retry(async () => {
          const data = await githubService.getFile(t.targetPath, targetRepo);
          if (!data || Array.isArray(data)) throw new Error('Target verification failed');
          return data;
        }, 'getFile(verify)');

        task!.status = 'verified';
        task!.lastUpdate = Date.now();
        await persistTask(task!);
      }

      if (t.status === 'verified') {
        const sourceRepo = await retry(() => resolveForRead(t.sourcePath, c.env), 'resolveForRead(delete)');
        const sourceData = await githubService.getFile(t.sourcePath, sourceRepo);
        if (sourceData && !Array.isArray(sourceData)) {
          await retry(async () => {
            const delRes = await githubService.deleteFile(
              t.sourcePath,
              sourceRepo,
              sourceData.sha,
              `Delete source after migration ${taskId}`
            );
            if (!delRes.ok && delRes.status !== 404) throw new Error(`Source deletion failed`);
          }, 'deleteFile');
        }
        task!.status = 'src_deleted';
        task!.lastUpdate = Date.now();
        await persistTask(task!);
      }

      if (t.status === 'src_deleted') {
        const size = t.fileSize || 0;
        if (db && t.targetRepoId && t.sourceRepoId) {
          try {
            const batch = [
              db.prepare(`UPDATE repos SET used_bytes = used_bytes + ?, file_count = file_count + 1 WHERE id = ?`).bind(size, t.targetRepoId),
              db.prepare(`INSERT INTO paths (path, repo_id, size_bytes) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET repo_id = excluded.repo_id, size_bytes = excluded.size_bytes`).bind(t.targetPath, t.targetRepoId, size),
              db.prepare(`UPDATE repos SET used_bytes = MAX(0, used_bytes - ?), file_count = MAX(0, file_count - 1) WHERE id = ?`).bind(size, t.sourceRepoId),
              db.prepare(`DELETE FROM paths WHERE path = ?`).bind(t.sourcePath)
            ];
            await db.batch(batch);
          } catch (e: any) {
            logger.error('d1_migration_commit_failed', { id: taskId, error: e.message });
          }
        }

        task!.status = 'indexed';
        task!.lastUpdate = Date.now();
        await persistTask(task!);
      }

      if (t.status === 'indexed') {
        c.executionCtx.waitUntil(purgeFileCache(t.sourcePath, c.env, new URL(c.req.url).origin));

        task!.status = 'done';
        task!.lastUpdate = Date.now();
        await persistTask(task!);
        c.executionCtx.waitUntil(logger.recordAudit(c, 'MOVE_FILE', {
          source: t.sourcePath,
          target: t.targetPath
        }));
      }

    })(), MIGRATION_TIMEOUT_MS, `migration:${taskId}`);

  } catch (err: any) {
    console.error(`Migration ${taskId} failed:`, err);
    if (db) {
      try {
        const failedTask: MigrationTask = {
          id: taskId,
          sourcePath: task?.sourcePath || '',
          targetPath: task?.targetPath || '',
          status: 'failed',
          error: 'Migration failed',
          startTime: task?.startTime || Date.now(),
          lastUpdate: Date.now()
        };
        await dbService.upsertTask(db, failedTask);
      } catch (e) {
        logger.error('d1_persist_migration_failure_failed', { id: taskId, error: String(e) });
      }
    }
  }
};

mutateApi.post('/mutate', async (c) => {
  try {
    const body = await c.req.json() as any;
    const { action, path, newPath } = body;

    if (action === 'rename') {
      if (!path || !newPath) return c.json({ error: 'Source and target paths are required' }, 400);
      if (!normalizePath('/' + path) || !normalizePath('/' + newPath)) {
        return c.json({ error: 'Invalid path or path traversal detected' }, 400);
      }
      if (path === newPath) return c.json({ success: true, taskId: 'noop' });

      const tokenInfo = c.get('tokenInfo' as any);
      const prefixCheck = checkPathPrefix(tokenInfo, path, newPath);
      if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

      const taskId = crypto.randomUUID();
      const task: MigrationTask = {
        id: taskId,
        sourcePath: path,
        targetPath: newPath,
        status: 'pending',
        startTime: Date.now(),
        lastUpdate: Date.now(),
        createdBy: c.get('user')?.email || 'unknown'
      };

      if (c.env.DB) {
        await dbService.upsertTask(c.env.DB, task);
        c.executionCtx.waitUntil(runMigration(taskId, c));
      }

      return c.json({ success: true, taskId, status: 'pending' });
    }

    return c.json({ error: 'Unsupported action' }, 400);
  } catch (err: any) {
    logger.captureError(c, err, { event: 'mutate_general_failed' });
    return c.json({ error: 'Operation failed' }, 500);
  }
});

mutateApi.get('/migrations/:id', async (c) => {
  const taskId = c.req.param('id');
  const tokenInfo = c.get('tokenInfo' as any);
  const isAdmin = isAdminUser(c);

  if (c.env.DB) {
    try {
      const task = await dbService.getTask(c.env.DB, taskId) as MigrationTask | null;
      if (task) {
        if (!isAdmin && tokenInfo?.pathPrefix) {
          const prefixCheck = checkPathPrefix(tokenInfo, task.sourcePath, task.targetPath);
          if (!prefixCheck.ok) return c.json({ error: 'Access denied' }, 403);
        }
        return c.json(task);
      }
    } catch (e) { /* ignore */ }
  }

  return c.json({ error: 'Task not found' }, 404);
});

mutateApi.post('/:path{.+}/move', async (c) => {
  try {
    const body = await c.req.json() as any;
    const sourcePath = c.req.param('path');
    const targetDir = (body.targetDir || '').replace(/^\/+|\/+$/g, '');
    if (!normalizePath('/' + sourcePath) || (targetDir && !normalizePath('/' + targetDir))) {
      return c.json({ error: 'Invalid path or path traversal detected' }, 400);
    }
    const fileName = sourcePath.split('/').pop() || '';
    const targetPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (sourcePath === targetPath) return c.json({ success: true, taskId: 'noop' });

    const tokenInfo = c.get('tokenInfo' as any);
    const prefixCheck = checkPathPrefix(tokenInfo, sourcePath, targetPath);
    if (!prefixCheck.ok) return c.json({ error: prefixCheck.error }, 403);

    const taskId = crypto.randomUUID();
    const task: MigrationTask = {
      id: taskId,
      sourcePath,
      targetPath,
      status: 'pending',
      startTime: Date.now(),
      lastUpdate: Date.now(),
      createdBy: c.get('user')?.email || 'unknown'
    };

    if (c.env.DB) {
      await dbService.upsertTask(c.env.DB, task);
      c.executionCtx.waitUntil(runMigration(taskId, c));
    }

    return c.json({ success: true, taskId, status: 'pending' });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'move_failed' });
    return c.json({ error: 'Operation failed' }, 500);
  }
});

export default mutateApi;
