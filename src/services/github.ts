import { Bindings } from '../types/env';
import { logger } from '../utils/logger';

export const fetchFromGitHub = async (
  path: string, 
  env: Bindings, 
  cfOptions?: RequestInitCfProperties
): Promise<Response> => {
  const url = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || 'main'}`;
  
  const headers = new Headers({
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
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

  logger.info('origin_fetch', { path, status: response.status, ms });

  return response;
};
