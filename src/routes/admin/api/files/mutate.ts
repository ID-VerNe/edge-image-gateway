import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../../types/env';
import { resolveForRead, resolveForWrite, RepoMeta } from '../../../../services/repoRouter';
import { githubService } from '../../../../services/github';
import { purgeFileCache } from '../../../../utils/cache';
import { logger } from '../../../../utils/logger';

const mutateApi = new Hono<AppEnvironment>();

mutateApi.post('/mkdir', async (c) => {
  try {
    const body = await c.req.json() as any;
    let path = (body.path || '').replace(/^\/+|\/+$/g, '');
    if (!path) return c.json({ error: 'Path is required' }, 400);

    const fullPath = `${path}/.keep`;
    const repo = await resolveForWrite(c.env);
    
    const githubRes = await githubService.putFile(
      fullPath, 
      repo, 
      Buffer.from('Folder kept alive by Edge Image Gateway').toString('base64'),
      `Create folder ${path} via Admin UI`
    );

    if (!githubRes.ok) {
      const errText = await githubRes.text();
      return c.json({ error: 'GitHub mkdir failed', details: errText }, 500);
    }

    if (c.env.REPO_REGISTRY) {
      await c.env.REPO_REGISTRY.put(`path::${fullPath}`, repo.meta.id);
    }

    c.executionCtx.waitUntil(logger.recordAudit(c, 'MKDIR', { path }));

    return c.json({ success: true, path });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'mkdir_failed' });
    return c.json({ error: 'Internal mkdir error', message: err.message }, 500);
  }
});

mutateApi.delete('/*', async (c) => {
  try {
    const reqUrl = new URL(c.req.url);
    let path = decodeURIComponent(reqUrl.pathname.replace('/admin/api/files/', ''));
    path = path.replace(/^\/+|\/+$/g, '');
    
    const isDir = c.req.query('type') === 'dir';
    const repo = await resolveForRead(path, c.env);

    if (isDir) {
      const treeData = await githubService.getTree(repo, true);
      if (!treeData) return c.json({ error: 'Failed to fetch repository tree' }, 500);
      
      const prefix = path ? `${path}/` : '';
      const itemsToDelete = treeData.tree.filter((item: any) => 
        item.type === 'blob' && (item.path === path || item.path.startsWith(prefix))
      );

      let deletedCount = 0;
      let deletedBytes = 0;
      for (const item of itemsToDelete) {
        const delRes = await githubService.deleteFile(
          item.path, 
          repo, 
          item.sha, 
          `Delete ${item.path} (recursive dir delete) via Admin UI`
        );
        if (delRes.ok) {
          deletedCount++;
          deletedBytes += item.size || 0;
          if (c.env.REPO_REGISTRY) {
            const recordStr = await c.env.REPO_REGISTRY.get(`path::${item.path}`);
            if (recordStr && recordStr.startsWith('{')) {
              try {
                const record = JSON.parse(recordStr);
                if (record.hash) await c.env.REPO_REGISTRY.delete(`hash::${record.hash}`);
              } catch {}
            }
            await c.env.REPO_REGISTRY.delete(`path::${item.path}`);
          }
        }
      }

      if (deletedCount > 0 && c.env.REPO_REGISTRY) {
        repo.meta.fileCount = Math.max(0, repo.meta.fileCount - deletedCount);
        repo.meta.sizeBytes = Math.max(0, repo.meta.sizeBytes - deletedBytes);
        await c.env.REPO_REGISTRY.put(`repo::${repo.meta.id}`, JSON.stringify(repo.meta));
        c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_DIR', { path, deletedCount }));
      }
      return c.json({ success: true, deletedCount });
    }

    // Single file deletion
    const fileData = await githubService.getFile(path, repo);
    if (!fileData || Array.isArray(fileData)) return c.json({ error: 'File not found on GitHub' }, 404);

    const delRes = await githubService.deleteFile(
      path, 
      repo, 
      fileData.sha, 
      `Delete ${path} via Admin UI`
    );

    if (!delRes.ok) {
      const errText = await delRes.text();
      return c.json({ error: 'GitHub delete failed', details: errText }, 500);
    }

    if (c.env.REPO_REGISTRY) {
      repo.meta.sizeBytes = Math.max(0, repo.meta.sizeBytes - (fileData.size || 0));
      repo.meta.fileCount = Math.max(0, repo.meta.fileCount - 1);
      
      const recordStr = await c.env.REPO_REGISTRY.get(`path::${path}`);
      if (recordStr && recordStr.startsWith('{')) {
        try {
          const record = JSON.parse(recordStr);
          if (record.hash) await c.env.REPO_REGISTRY.delete(`hash::${record.hash}`);
        } catch {}
      }
      
      await c.env.REPO_REGISTRY.put(`repo::${repo.meta.id}`, JSON.stringify(repo.meta));
      await c.env.REPO_REGISTRY.delete(`path::${path}`);

      // Granular Cache Purge
      c.executionCtx.waitUntil(purgeFileCache(path, c.env, new URL(c.req.url).origin));
      c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_FILE', { path }));
    }

    return c.json({ success: true, path });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'delete_failed' });
    return c.json({ error: 'Internal delete error', message: err.message }, 500);
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
}

const runMigration = async (taskId: string, c: any) => {
  const kv = c.env.REPO_REGISTRY;
  if (!kv) return;

  const updateStatus = async (status: MigrationTask['status'], extra: Partial<MigrationTask> = {}) => {
    const taskStr = await kv.get(`migration::${taskId}`);
    if (!taskStr) return;
    const task = JSON.parse(taskStr) as MigrationTask;
    task.status = status;
    task.lastUpdate = Date.now();
    Object.assign(task, extra);
    await kv.put(`migration::${taskId}`, JSON.stringify(task), { expirationTtl: 86400 });
    return task;
  };

  try {
    const taskStr = await kv.get(`migration::${taskId}`);
    if (!taskStr) return;
    let task = JSON.parse(taskStr) as MigrationTask;

    // 1. Fetch Source & Copy (PENDING -> COPIED)
    if (task.status === 'pending') {
      const sourceRepo = await resolveForRead(task.sourcePath, c.env);
      const sourceData = await githubService.getFile(task.sourcePath, sourceRepo);
      if (!sourceData || Array.isArray(sourceData)) throw new Error('Source file not found');
      
      const content = (sourceData as any).content;
      const fileSize = sourceData.size || 0;
      const targetRepo = await resolveForWrite(c.env, fileSize);

      const putRes = await githubService.putFile(
        task.targetPath, 
        targetRepo, 
        content, 
        `Move ${task.sourcePath} (Task: ${taskId})`
      );
      if (!putRes.ok) throw new Error(`Copy failed: ${await putRes.text()}`);

      task = await updateStatus('copied', { 
        fileSize, 
        sourceRepoId: sourceRepo.meta.id, 
        targetRepoId: targetRepo.meta.id 
      });
    }

    // 2. Verify (COPIED -> VERIFIED)
    if (task.status === 'copied') {
      const targetRepo = await resolveForRead(task.targetPath, c.env); // Should be resolveById but we use read for now
      const targetData = await githubService.getFile(task.targetPath, targetRepo);
      if (!targetData || Array.isArray(targetData)) throw new Error('Target verification failed: File not found after copy');
      
      task = await updateStatus('verified');
    }

    // 3. Delete Source (VERIFIED -> SRC_DELETED)
    if (task.status === 'verified') {
      const sourceRepo = await resolveForRead(task.sourcePath, c.env);
      const sourceData = await githubService.getFile(task.sourcePath, sourceRepo);
      if (sourceData && !Array.isArray(sourceData)) {
        const delRes = await githubService.deleteFile(
          task.sourcePath, 
          sourceRepo, 
          sourceData.sha, 
          `Delete source after migration ${taskId}`
        );
        if (!delRes.ok && delRes.status !== 404) throw new Error(`Source deletion failed: ${await delRes.text()}`);
      }
      task = await updateStatus('src_deleted');
    }

    // 4. Update KV & Stats (SRC_DELETED -> INDEXED)
    if (task.status === 'src_deleted') {
      const sourceRepo = await resolveForRead(task.sourcePath, c.env); // Reload to get meta
      const targetRepo = await resolveForRead(task.targetPath, c.env);

      // Update Path Mapping
      await kv.put(`path::${task.targetPath}`, JSON.stringify({ repoId: task.targetRepoId }));
      await kv.delete(`path::${task.sourcePath}`);

      // Update Stats
      const size = task.fileSize || 0;
      if (task.targetRepoId) {
        const tMeta = await kv.get<RepoMeta>(`repo::${task.targetRepoId}`, 'json');
        if (tMeta) {
          tMeta.sizeBytes += size;
          tMeta.fileCount += 1;
          await kv.put(`repo::${task.targetRepoId}`, JSON.stringify(tMeta));
        }
      }
      if (task.sourceRepoId && task.sourceRepoId !== task.targetRepoId) {
        const sMeta = await kv.get<RepoMeta>(`repo::${task.sourceRepoId}`, 'json');
        if (sMeta) {
          sMeta.sizeBytes = Math.max(0, sMeta.sizeBytes - size);
          sMeta.fileCount = Math.max(0, sMeta.fileCount - 1);
          await kv.put(`repo::${task.sourceRepoId}`, JSON.stringify(sMeta));
        }
      }
      
      task = await updateStatus('indexed');
    }

    // 5. Done
    if (task.status === 'indexed') {
      // Clear Cache (including all variants)
      c.executionCtx.waitUntil(purgeFileCache(task.sourcePath, c.env, new URL(c.req.url).origin));
      
      await updateStatus('done');
      c.executionCtx.waitUntil(logger.recordAudit(c, 'MOVE_FILE', { 
        source: task.sourcePath, 
        target: task.targetPath 
      }));
    }

  } catch (err: any) {
    console.error(`Migration ${taskId} failed:`, err);
    await updateStatus('failed', { error: err.message });
  }
};

mutateApi.get('/migrations/:id', async (c) => {
  const kv = c.env.REPO_REGISTRY;
  if (!kv) return c.json({ error: 'KV not configured' }, 400);
  const task = await kv.get(`migration::${c.req.param('id')}`, 'json');
  if (!task) return c.json({ error: 'Task not found' }, 404);
  return c.json(task);
});

mutateApi.post('/*/move', async (c) => {
  try {
    const body = await c.req.json() as any;
    const reqUrl = new URL(c.req.url);
    const sourcePath = decodeURIComponent(reqUrl.pathname.replace('/admin/api/files/', '').replace('/move', '')).replace(/^\/+|\/+$/g, '');
    const targetDir = (body.targetDir || '').replace(/^\/+|\/+$/g, '');
    const fileName = sourcePath.split('/').pop() || '';
    const targetPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (sourcePath === targetPath) return c.json({ success: true, taskId: 'noop' });

    const taskId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: MigrationTask = {
      id: taskId,
      sourcePath,
      targetPath,
      status: 'pending',
      startTime: Date.now(),
      lastUpdate: Date.now()
    };

    if (c.env.REPO_REGISTRY) {
      await c.env.REPO_REGISTRY.put(`migration::${taskId}`, JSON.stringify(task), { expirationTtl: 86400 });
      c.executionCtx.waitUntil(runMigration(taskId, c));
    }

    return c.json({ success: true, taskId, status: 'pending' });
  } catch (err: any) {
    logger.captureError(c, err, { event: 'move_failed' });
    return c.json({ error: 'Internal move error', message: err.message }, 500);
  }
});

export default mutateApi;
