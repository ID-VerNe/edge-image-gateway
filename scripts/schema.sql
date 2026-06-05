-- Schema for Edge Image Gateway D1 Database

-- Repository Metadata
CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    status TEXT NOT NULL DEFAULT 'active', -- active, readonly, draining, archived
    capacity_limit_bytes INTEGER NOT NULL,
    used_bytes INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    token_secret_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- File Path Mappings (Hot Path)
CREATE TABLE IF NOT EXISTS paths (
    path TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    size_bytes INTEGER,
    hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
);
CREATE INDEX IF NOT EXISTS idx_paths_repo_id ON paths(repo_id);

-- Admin Authentication Tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    name TEXT,
    permissions TEXT, -- JSON array of strings
    path_prefix TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_used_at DATETIME
);

-- Audit Logs for Dashboard
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME NOT NULL,
    action TEXT NOT NULL,
    user_email TEXT NOT NULL,
    ip TEXT NOT NULL,
    details TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Migration Tasks (File Move/Rename)
CREATE TABLE IF NOT EXISTS migration_tasks (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    status TEXT NOT NULL, -- pending, copied, verified, src_deleted, indexed, done, failed
    file_size INTEGER,
    source_repo_id TEXT,
    target_repo_id TEXT,
    error TEXT,
    start_time DATETIME NOT NULL,
    last_update DATETIME NOT NULL
);

-- System Configurations (Mirrored from/to KV)
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initial Data (Optional - e.g. current_write placeholder)
-- INSERT OR IGNORE INTO system_config (key, value) VALUES ('route::current_write', 'fallback');
