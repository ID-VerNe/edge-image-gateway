import { Hono } from 'hono';
import { Buffer } from 'node:buffer';
import { AppEnvironment } from '../../../types/env';
import { resolveForRead, resolveForWrite } from '../../../services/repoRouter';

const fileApi = new Hono<AppEnvironment>();

fileApi.post('/mkdir', async (c) => {
  try {
    const body = await c.req.json() as any;
    let path = (body.path || '').replace(/^\/+|\/+$/g, '');
    if (!path) return c.json({ error: 'Path is required' }, 400);

    const fullPath = `${path}/.keep`;
    const repo = await resolveForWrite(c.env);
    
    const githubUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${fullPath}`;
    const githubRes = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${repo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Create folder ${path} via Admin UI`,
        content: Buffer.from('Folder kept alive by Picbed Admin').toString('base64'),
        branch: repo.meta.branch
      })
    });

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

fileApi.get('/', async (c) => {
  try {
    const prefix = (c.req.query('prefix') || '').replace(/^\/+|\/+$/g, '');
    const repo = await resolveForRead(prefix, c.env);
    
    const githubUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${prefix}?ref=${repo.meta.branch}`;
    const githubRes = await fetch(githubUrl, {
      headers: {
        'Authorization': `Bearer ${repo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy'
      }
    });

    if (!githubRes.ok) {
      if (githubRes.status === 404) return c.json({ files: [] });
      const errText = await githubRes.text();
      return c.json({ error: 'GitHub list failed', details: errText }, 500);
    }

    const data = await githubRes.json();
    return c.json({ files: Array.isArray(data) ? data : [data] });
  } catch (err: any) {
    return c.json({ error: 'Internal list error', message: err.message }, 500);
  }
});

fileApi.delete('/*', async (c) => {
  try {
    const reqUrl = new URL(c.req.url);
    // Remove /admin/api/files/ prefix
    const path = reqUrl.pathname.replace('/admin/api/files/', '');
    const isDir = c.req.query('type') === 'dir';
    
    const repo = await resolveForRead(path, c.env);

    if (isDir) {
      const listUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}?ref=${repo.meta.branch}`;
      const listRes = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${repo.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'cf-worker-img-proxy'
        }
      });
      if (!listRes.ok) return c.json({ error: 'Directory not found' }, 404);
      const items: any = await listRes.json();
      
      for (const item of (Array.isArray(items) ? items : [items])) {
        if (item.type === 'file') {
          await fetch(`https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${item.path}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${repo.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'cf-worker-img-proxy',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Delete ${item.path} (dir cleanup) via Admin UI`,
              sha: item.sha,
              branch: repo.meta.branch
            })
          });
          if (c.env.REPO_REGISTRY) {
            await c.env.REPO_REGISTRY.delete(`path::${item.path}`);
          }
        }
      }
      return c.json({ success: true, path });
    }

    const getUrl = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}?ref=${repo.meta.branch}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${repo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy'
      }
    });

    if (!getRes.ok) return c.json({ error: 'File not found on GitHub' }, 404);
    const fileData: any = await getRes.json();

    const delRes = await fetch(getUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${repo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete ${path} via Admin UI`,
        sha: fileData.sha,
        branch: repo.meta.branch
      })
    });

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

fileApi.post('/*/move', async (c) => {
  try {
    const reqUrl = new URL(c.req.url);
    const sourcePath = reqUrl.pathname.replace('/admin/api/files/', '').replace('/move', '');
    const body = await c.req.json() as any;
    const targetDir = (body.targetDir || '').replace(/^\/+|\/+$/g, '');
    const fileName = sourcePath.split('/').pop() || '';
    const targetPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (sourcePath === targetPath) return c.json({ success: true });

    const sourceRepo = await resolveForRead(sourcePath, c.env);
    
    const getUrl = `https://api.github.com/repos/${sourceRepo.meta.owner}/${sourceRepo.meta.name}/contents/${sourcePath}?ref=${sourceRepo.meta.branch}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${sourceRepo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy'
      }
    });

    if (!getRes.ok) return c.json({ error: 'Source file not found' }, 404);
    const sourceData: any = await getRes.json();

    const targetRepo = await resolveForWrite(c.env);
    const putUrl = `https://api.github.com/repos/${targetRepo.meta.owner}/${targetRepo.meta.name}/contents/${targetPath}`;
    
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${targetRepo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Move ${sourcePath} to ${targetPath} via Admin UI`,
        content: sourceData.content,
        branch: targetRepo.meta.branch
      })
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return c.json({ error: 'Failed to write target file', details: errText }, 500);
    }

    await fetch(getUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sourceRepo.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-worker-img-proxy',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete ${sourcePath} (moved to ${targetPath}) via Admin UI`,
        sha: sourceData.sha,
        branch: sourceRepo.meta.branch
      })
    });

    if (c.env.REPO_REGISTRY) {
      await c.env.REPO_REGISTRY.delete(`path::${sourcePath}`);
      await c.env.REPO_REGISTRY.put(`path::${targetPath}`, targetRepo.meta.id);
    }

    return c.json({ success: true, targetPath });

  } catch (err: any) {
    return c.json({ error: 'Internal move error', message: err.message }, 500);
  }
});

export default fileApi;
