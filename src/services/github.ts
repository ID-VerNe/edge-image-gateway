import { Bindings } from '../types/env';
import { logger } from '../utils/logger';
import { ResolvedRepo } from './repoRouter';

export const fetchFromGitHub = async (
  path: string, 
  repo: ResolvedRepo,
  cfOptions?: RequestInitCfProperties
): Promise<Response> => {
  const { meta, token } = repo;
  const url = `https://api.github.com/repos/${meta.owner}/${meta.name}/contents/${path}?ref=${meta.branch}`;
  
  const headers = new Headers({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.raw',
    'User-Agent': 'cf-worker-img-proxy'
  });

  const startTime = Date.now();
  const response = await fetch(url, { 
    method: 'GET', 
    headers,
    cf: cfOptions
  });
  const ms = Date.now() - startTime;

  logger.info('origin_fetch', { path, status: response.status, ms, repo: meta.id });

  return response;
};
