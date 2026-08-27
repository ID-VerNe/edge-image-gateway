/**
 * Mock D1Database for unit testing.
 * Simulates in-memory D1 tables for repos, paths, auth_tokens, providers, system_config.
 */

export function makeMockD1(initialState?: {
  repos?: any[];
  paths?: Record<string, string>; // path -> repo_id
  configs?: Record<string, string>; // key -> value
  tokens?: any[];
  providers?: any[];
}) {
  const repos = [...(initialState?.repos || [])];
  const paths = { ...(initialState?.paths || {}) };
  const configs = { ...(initialState?.configs || {}) };
  const tokens = [...(initialState?.tokens || [])];
  const providers = [...(initialState?.providers || [])];

  const db: any = {
    prepare: (sql: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...args: any[]) => {
          boundParams = args;
          return stmt;
        },
        first: async () => {
          if (sql.includes('FROM paths WHERE path =')) {
            const p = boundParams[0];
            const repo_id = paths[p];
            return repo_id ? { repo_id } : null;
          }
          if (sql.includes('FROM system_config WHERE key =')) {
            const k = boundParams[0];
            const val = configs[k];
            return val ? { value: val } : null;
          }
          if (sql.includes('FROM auth_tokens WHERE token =')) {
            const t = boundParams[0];
            const tok = tokens.find(x => x.token === t);
            return tok ? { ...tok, permissions: typeof tok.permissions === 'string' ? tok.permissions : JSON.stringify(tok.permissions) } : null;
          }
          if (sql.includes('COUNT(*) as count FROM path_providers')) {
            const providerId = boundParams[0];
            const count = Object.values(paths).filter(pid => pid === providerId).length;
            return { count };
          }
          return null;
        },
        all: async () => {
          if (sql.includes('FROM repos')) {
            return {
              results: repos.map(r => ({
                id: r.id,
                owner: r.owner,
                name: r.name,
                branch: r.branch || 'main',
                status: r.status || 'active',
                created_at: r.createdAt || new Date().toISOString(),
                used_bytes: r.sizeBytes || r.used_bytes || 0,
                file_count: r.fileCount || r.file_count || 0,
                capacity_limit_bytes: r.capacityLimitBytes || r.capacity_limit_bytes || 5e9,
                token_secret_name: r.tokenSecretName || r.token_secret_name || 'GITHUB_TOKEN'
              }))
            };
          }
          if (sql.includes('FROM providers')) {
            return { results: providers };
          }
          if (sql.includes('FROM auth_tokens')) {
            return { results: tokens };
          }
          return { results: [] };
        },
        run: async () => {
          if (sql.includes('INSERT INTO system_config') || sql.includes('UPDATE system_config')) {
            configs[boundParams[0]] = boundParams[1];
          }
          return { success: true };
        }
      };
      return stmt;
    },
    batch: async (statements: any[]) => {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };

  return db;
}
