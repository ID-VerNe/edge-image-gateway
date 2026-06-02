import { ResolvedRepo } from './repoRouter';
import { logger } from '../utils/logger';

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

  private async request(url: string, repo: ResolvedRepo, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${repo.token}`);
    headers.set('Accept', 'application/vnd.github.v3+json');
    headers.set('User-Agent', this.userAgent);

    return fetch(url, { ...options, headers });
  }

  async fetchRaw(path: string, repo: ResolvedRepo, cfOptions?: RequestInitCfProperties): Promise<Response> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}?ref=${repo.meta.branch}`;
    const headers = new Headers({
      'Authorization': `Bearer ${repo.token}`,
      'Accept': 'application/vnd.github.raw',
      'User-Agent': this.userAgent
    });

    return fetch(url, { method: 'GET', headers, cf: cfOptions });
  }

  async fileExists(path: string, repo: ResolvedRepo): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}?ref=${repo.meta.branch}`;
    const res = await this.request(url, repo, { method: 'HEAD' });
    return res.status === 200;
  }

  async getFile(path: string, repo: ResolvedRepo): Promise<GitHubItem | null> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}?ref=${repo.meta.branch}`;
    const res = await this.request(url, repo);
    if (!res.ok) return null;
    return res.json();
  }

  async putFile(path: string, repo: ResolvedRepo, contentBase64: string, message: string): Promise<Response> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}`;
    return this.request(url, repo, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: repo.meta.branch
      })
    });
  }

  async deleteFile(path: string, repo: ResolvedRepo, sha: string, message: string): Promise<Response> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/contents/${path}`;
    return this.request(url, repo, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sha,
        branch: repo.meta.branch
      })
    });
  }

  async getTree(repo: ResolvedRepo, recursive: boolean = false): Promise<any> {
    const url = `https://api.github.com/repos/${repo.meta.owner}/${repo.meta.name}/git/trees/${repo.meta.branch}${recursive ? '?recursive=1' : ''}`;
    const res = await this.request(url, repo);
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
export const fetchFromGitHub = async (path: string, repo: ResolvedRepo, cfOptions?: RequestInitCfProperties) => {
  return githubService.fetchRaw(path, repo, cfOptions);
};
