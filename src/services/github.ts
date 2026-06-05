import { ResolvedRepo } from './repoRouter';
import { logger } from '../utils/logger';
import { alertThrottled } from '../utils/notifications';

export interface GitHubItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: 'file' | 'dir';
}

export class GitHubService {
  private userAgent = 'cf-worker-edge-image-gateway';

  private async request(url: string, repo: ResolvedRepo, options: RequestInit = {}, env?: any, ctx?: any): Promise<Response> {
    const headers = new Headers(options.headers || {});
    
    // Set Auth
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${repo.token}`);
    }
    
    // Set Accept (GitHub specific default if not provided)
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/vnd.github.v3+json');
    }
    
    // Set User-Agent
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', this.userAgent);
    }

    const res = await fetch(url, { ...options, headers });

    // Monitor Rate Limit
    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (remaining && parseInt(remaining, 10) < 1000 && env) {
      alertThrottled('gh_rate_limit', 
        `🛑 <b>GitHub API Rate Limit Warning</b>\nRemaining: <b>${remaining}</b> / ${res.headers.get('X-RateLimit-Limit')}\nReset: ${new Date(parseInt(res.headers.get('X-RateLimit-Reset') || '0', 10) * 1000).toLocaleString()}`,
        env, 2, ctx
      );
    }

    return res;
  }

  private encodePath(path: string): string {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  }

  async fetchRaw(path: string, repo: ResolvedRepo, cfOptions?: RequestInitCfProperties, env?: any, ctx?: any): Promise<Response> {
    const encodedPath = this.encodePath(path);
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}?ref=${repo.meta.branch}`;
    return this.request(url, repo, { 
      method: 'GET', 
      headers: { 'Accept': 'application/vnd.github.v3.raw' },
      cf: cfOptions 
    }, env, ctx);
  }

  async fileExists(path: string, repo: ResolvedRepo, env?: any, ctx?: any): Promise<boolean> {
    const encodedPath = this.encodePath(path);
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}?ref=${repo.meta.branch}`;
    const res = await this.request(url, repo, { method: 'HEAD' }, env, ctx);
    return res.status === 200;
  }

  async getFile(path: string, repo: ResolvedRepo, env?: any, ctx?: any): Promise<GitHubItem | null> {
    const encodedPath = this.encodePath(path);
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}?ref=${repo.meta.branch}`;
    const res = await this.request(url, repo, {}, env, ctx);
    if (!res.ok) return null;
    return res.json();
  }

  async putFile(path: string, repo: ResolvedRepo, contentBase64: string, message: string, env?: any, ctx?: any): Promise<Response> {
    const encodedPath = this.encodePath(path);
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}`;
    return this.request(url, repo, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: repo.meta.branch
      })
    }, env, ctx);
  }

  async deleteFile(path: string, repo: ResolvedRepo, sha: string, message: string, env?: any, ctx?: any): Promise<Response> {
    const encodedPath = this.encodePath(path);
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${encodedPath}`;
    return this.request(url, repo, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sha,
        branch: repo.meta.branch
      })
    }, env, ctx);
  }

  async getTree(repo: ResolvedRepo, recursive: boolean = false, env?: any, ctx?: any): Promise<any> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/git/trees/${repo.meta.branch}${recursive ? '?recursive=1' : ''}`;
    const res = await this.request(url, repo, {}, env, ctx);
    if (!res.ok) return null;
    return res.json();
  }

  async createRepository(owner: string, name: string, token: string): Promise<Response> {
    const url = 'https://api.github.com/user/repos';
    const headers = new Headers({
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': this.userAgent,
      'Content-Type': 'application/json'
    });

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        private: true,
        description: 'Image storage for Edge Image Gateway',
        auto_init: false
      })
    });
  }
}

export const githubService = new GitHubService();

// Keep backward compatibility for image routing
export const fetchFromGitHub = async (path: string, repo: ResolvedRepo, cfOptions?: RequestInitCfProperties, env?: any, ctx?: any) => {
  return githubService.fetchRaw(path, repo, cfOptions, env, ctx);
};
