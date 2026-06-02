import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../../types/env';
import { resolveForRead, resolveForWrite } from '../../../../services/repoRouter';
import { githubService } from '../../../../services/github';

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

    return c.json({ success: true, path });
  } catch (err: any) {
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
      for (const item of itemsToDelete) {
        const delRes = await githubService.deleteFile(
          item.path, 
          repo, 
          item.sha, 
          `Delete ${item.path} (recursive dir delete) via Admin UI`
        );
        if (delRes.ok) {
          deletedCount++;
          if (c.env.REPO_REGISTRY) {
            await c.env.REPO_REGISTRY.delete(`path::${item.path}`);
          }
        }
      }

      if (deletedCount > 0 && c.env.REPO_REGISTRY) {
        repo.meta.fileCount = Math.max(0, repo.meta.fileCount - deletedCount);
        await c.env.REPO_REGISTRY.put(`repo::${repo.meta.id}`, JSON.stringify(repo.meta));
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
      await c.env.REPO_REGISTRY.put(`repo::${repo.meta.id}`, JSON.stringify(repo.meta));
      await c.env.REPO_REGISTRY.delete(`path::${path}`);
    }

    return c.json({ success: true, path });
  } catch (err: any) {
    return c.json({ error: 'Internal delete error', message: err.message }, 500);
  }
});

mutateApi.post('/*/move', async (c) => {
  try {
    const body = await c.req.json() as any;
    const reqUrl = new URL(c.req.url);
    const sourcePath = decodeURIComponent(reqUrl.pathname.replace('/admin/api/files/', '').replace('/move', '')).replace(/^\/+|\/+$/g, '');
    const targetDir = (body.targetDir || '').replace(/^\/+|\/+$/g, '');
    const fileName = sourcePath.split('/').pop() || '';
    const targetPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (sourcePath === targetPath) return c.json({ success: true });

    const sourceRepo = await resolveForRead(sourcePath, c.env);
    const sourceData = await githubService.getFile(sourcePath, sourceRepo);
    if (!sourceData || Array.isArray(sourceData)) return c.json({ error: 'Source file not found' }, 404);
    
    // We need the content, getFile with vnd.github.v3+json returns base64 content if it's a file
    const content = (sourceData as any).content;
    const fileSize = sourceData.size || 0;

    const targetRepo = await resolveForWrite(c.env, fileSize);
    const putRes = await githubService.putFile(
      targetPath, 
      targetRepo, 
      content, 
      `Move ${sourcePath} to ${targetPath} via Admin UI`
    );

    if (!putRes.ok) {
      const errText = await putRes.text();
      return c.json({ error: 'Failed to write target file', details: errText }, 500);
    }

    if (c.env.REPO_REGISTRY) {
      await c.env.REPO_REGISTRY.put(`path::${targetPath}`, targetRepo.meta.id);
      targetRepo.meta.sizeBytes += fileSize;
      targetRepo.meta.fileCount += 1;
      await c.env.REPO_REGISTRY.put(`repo::${targetRepo.meta.id}`, JSON.stringify(targetRepo.meta));

      if (sourceRepo.meta.id !== targetRepo.meta.id) {
        sourceRepo.meta.sizeBytes = Math.max(0, sourceRepo.meta.sizeBytes - fileSize);
        sourceRepo.meta.fileCount = Math.max(0, sourceRepo.meta.fileCount - 1);
        await c.env.REPO_REGISTRY.put(`repo::${sourceRepo.meta.id}`, JSON.stringify(sourceRepo.meta));
      }
      await c.env.REPO_REGISTRY.delete(`path::${sourcePath}`);
    }

    await githubService.deleteFile(
      sourcePath, 
      sourceRepo, 
      sourceData.sha, 
      `Delete ${sourcePath} (moved to ${targetPath}) via Admin UI`
    );

    try {
      const cache = caches.default;
      const origin = new URL(c.req.url).origin;
      await cache.delete(new Request(`${origin}/${sourcePath}`));
    } catch (e) {}

    return c.json({ success: true, targetPath });
  } catch (err: any) {
    return c.json({ error: 'Internal move error', message: err.message }, 500);
  }
});

export default mutateApi;
