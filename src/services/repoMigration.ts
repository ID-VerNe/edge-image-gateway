import { Bindings } from '../types/env';
import { githubService } from './github';
import { getRepoById } from './repoRouter';
import { dbService } from './database';
import { purgeFileCache } from '../utils/cache';
import { logger } from '../utils/logger';

export interface RepoMigrationJob {
  jobId: string;
  sourceRepo: string;
  targetRepo: string;
  status: 'running' | 'paused' | 'done' | 'failed';
  cursor: string | null; // The last processed file path
  total: number;
  migrated: number;
  failed: number;
  errors: { path: string, reason: string }[];
  startedAt: number;
  updatedAt: number;
}

export const saveJob = async (job: RepoMigrationJob, env: Bindings) => {
  job.updatedAt = Date.now();
  if (env.REPO_REGISTRY) {
    await env.REPO_REGISTRY.put(`repo_migration::${job.jobId}`, JSON.stringify(job));
  }
};

export const migrateRepo = async (job: RepoMigrationJob, env: Bindings) => {
  const sourceRepoObj = await getRepoById(job.sourceRepo, env);
  const targetRepoObj = await getRepoById(job.targetRepo, env);

  if (!sourceRepoObj || !targetRepoObj) {
    job.status = 'failed';
    job.errors.push({ path: 'INIT', reason: 'Source or target repository not found' });
    await saveJob(job, env);
    return;
  }

  try {
    const treeData = await githubService.getTree(sourceRepoObj, true, env);
    if (!treeData || !treeData.tree) {
      throw new Error('Failed to fetch source tree');
    }

    const files = treeData.tree
      .filter((item: any) => item.type === 'blob')
      .map((item: any) => ({ path: item.path, sha: item.sha, size: item.size || 0 }))
      .sort((a: any, b: any) => a.path.localeCompare(b.path));

    job.total = files.length;

    let startIndex = 0;
    if (job.cursor) {
      const idx = files.findIndex((f: any) => f.path > (job.cursor as string));
      if (idx !== -1) startIndex = idx;
      else startIndex = files.length; // Already done
    }

    for (let i = startIndex; i < files.length; i++) {
      const file = files[i];
      try {
        // 1. Check if target already has this file
        const existsInTarget = await githubService.fileExists(file.path, targetRepoObj, env);
        if (!existsInTarget) {
          // 2. Read source content
          const sourceData = await githubService.getFile(file.path, sourceRepoObj, env);
          if (!sourceData || Array.isArray(sourceData)) throw new Error('Source file not found or is dir');
          const content = (sourceData as any).content;

          // 3. Write target content
          const putRes = await githubService.putFile(
            file.path,
            targetRepoObj,
            content,
            `Migrate ${file.path} from ${job.sourceRepo}`,
            env
          );

          if (!putRes.ok) {
            // Check for rate limit exhausted (status 403)
            if (putRes.status === 403 && putRes.headers.get('X-RateLimit-Remaining') === '0') {
               throw new Error('RateLimitExhaustedError');
            }
            throw new Error(`Write target failed: ${await putRes.text()}`);
          }
        }

        // 4. Update index (KV & DB)
        if (env.REPO_REGISTRY) {
          await env.REPO_REGISTRY.put(`path::${file.path}`, JSON.stringify({ repoId: job.targetRepo }));
        }
        if (env.DB) {
          await env.DB.prepare(`INSERT INTO paths (path, repo_id, size_bytes) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET repo_id = excluded.repo_id`).bind(file.path, job.targetRepo, file.size).run();
          await env.DB.prepare(`UPDATE repos SET used_bytes = used_bytes + ?, file_count = file_count + 1 WHERE id = ?`).bind(file.size, job.targetRepo).run();
        }

        // 5. Verify target is readable, then delete source
        const verifyExists = await githubService.fileExists(file.path, targetRepoObj, env);
        if (verifyExists) {
          const delRes = await githubService.deleteFile(
            file.path,
            sourceRepoObj,
            file.sha,
            `Delete source after migration ${job.jobId}`,
            env
          );
          if (delRes.ok && env.DB) {
             await env.DB.prepare(`UPDATE repos SET used_bytes = MAX(0, used_bytes - ?), file_count = MAX(0, file_count - 1) WHERE id = ?`).bind(file.size, job.sourceRepo).run();
          }
        }

        job.migrated++;
        job.cursor = file.path;

        // Save progress occasionally to avoid KV rate limits
        if (job.migrated % 10 === 0) {
          await saveJob(job, env);
        }

      } catch (e: any) {
        if (e.message === 'RateLimitExhaustedError') {
          job.status = 'paused';
          job.cursor = file.path;
          await saveJob(job, env);
          return;
        }
        job.failed++;
        job.errors.push({ path: file.path, reason: String(e) });
      }
    }

    job.status = 'done';
    await saveJob(job, env);

    // If fully done, mark source repo as archived (optional, but good practice)
    if (job.failed === 0) {
      if (env.REPO_REGISTRY) {
         sourceRepoObj.meta.status = 'archived';
         sourceRepoObj.meta.sizeBytes = 0;
         sourceRepoObj.meta.fileCount = 0;
         await env.REPO_REGISTRY.put(`repo::${job.sourceRepo}`, JSON.stringify(sourceRepoObj.meta));
      }
      if (env.DB) {
         await env.DB.prepare(`UPDATE repos SET status = 'archived', used_bytes = 0, file_count = 0 WHERE id = ?`).bind(job.sourceRepo).run();
      }
    }

  } catch (e: any) {
    job.status = 'failed';
    job.errors.push({ path: 'GENERAL', reason: String(e) });
    await saveJob(job, env);
  }
};
