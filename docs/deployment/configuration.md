# 配置说明

## 概览

Edge Image Gateway 的配置分为三个层次：

1. **环境变量 / Secrets** — 在 `wrangler.toml` 或 Cloudflare Dashboard 中配置
2. **D1 动态配置** — 通过管理面板或直接操作 D1 的运行时配置
3. **wrangler 配置** — Workers 部署配置文件

---

## 环境变量

### 必需变量

| 变量 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `ENVIRONMENT` | 明文 | 运行环境标识 | `production` 或 `development` |
| `GITHUB_USER` | 明文 | GitHub 用户名或组织名 | `my-username` |
| `GITHUB_REPO` | 明文 | 默认的 GitHub 仓库名 | `my-image-hosting` |
| `GITHUB_BRANCH` | 明文 | 仓库分支 | `main` |
| `GITHUB_TOKEN` | **Secret** | GitHub Personal Access Token，需要 `repo` 权限 | `ghp_xxx` |
| `SIGN_SECRET` | **Secret** | HMAC 签名密钥，用于分享链接和内部回环认证 | 随机字符串 |

> `ENVIRONMENT` 设为 `production` 时，错误响应会隐藏堆栈信息，避免泄露内部细节。

### 可选变量

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ENVIRONMENT` | 明文 | `development` | 运行环境（`production` 或 `development`）。生产环境下隐藏错误堆栈。 |
| `ALLOWED_REFERERS` | 明文 | `*`（允许所有） | 防盗链白名单，逗号分隔。示例：`https://example.com,https://blog.example.com` |
| `CACHE_TTL_SECONDS` | 明文 | `604800` | 成功响应的 CDN 缓存时间（秒），默认 7 天 |
| `ENABLE_SIGNATURE` | 明文 | `false` | 是否启用上传签名认证。设为 `true` 后，所有写操作需带签名 |
| `RATE_LIMIT_PER_MIN` | 明文 | `100` | 每分钟每 IP 允许的最大请求数 |
| `APP_TITLE` | 明文 | `Edge Image Gateway` | 首页显示的标题 |
| `APP_DESCRIPTION` | 明文 | `Ready to serve images.` | 首页显示的描述文字 |
| `ADMIN_EMAILS` | 明文 | 无 | 管理员邮箱白名单，逗号分隔。用于 Cloudflare Access 验证 |
| `EMERGENCY_LOCKDOWN` | 明文 | `false` | 紧急熔断开关。设为 `true` 后拒绝所有写操作 |
| `CF_ZONE_ID` | 明文 | 无 | Cloudflare Zone ID，用于管理面板的缓存清除功能 |
| `CF_API_TOKEN` | **Secret** | 无 | Cloudflare API Token，需要 `zone:purge` 权限 |
| `SENTRY_DSN` | **Secret** | 无 | Sentry DSN，用于错误日志上报 |
| `TELEGRAM_BOT_TOKEN` | **Secret** | 无 | Telegram Bot Token，用于告警通知 |
| `TELEGRAM_CHAT_ID` | **Secret** | 无 | Telegram 聊天/频道 ID，用于告警通知 |
| `ADMIN_TOTP_SECRET` | **Secret** | 无 | TOTP 密钥，用于管理面板的双因素认证 |
| `ANALYTICS_ENGINE` | 绑定 | 无 | Cloudflare Analytics Engine 数据集绑定 |

---

## 在 wrangler.toml 中配置

参考 `wrangler.toml.example`：

```toml
name = "edge-image-gateway"
main = "src/index.ts"
compatibility_date = "2024-05-31"

# KV Namespace 绑定
[[kv_namespaces]]
binding = "REPO_REGISTRY"
id = "your-kv-namespace-id"

# D1 Database 绑定
[[d1_databases]]
binding = "DB"
database_name = "edge-image-gateway-db"
database_id = "your-d1-database-id"

# R2 Bucket 绑定
[[r2_buckets]]
binding = "CACHE_BUCKET"
bucket_name = "edge-image-gateway-cache"

# 环境变量
[vars]
GITHUB_USER = "your-github-username"
GITHUB_REPO = "your-image-repo"
GITHUB_BRANCH = "main"
ALLOWED_REFERERS = "https://example.com"
CACHE_TTL_SECONDS = "604800"
ENABLE_SIGNATURE = "false"
RATE_LIMIT_PER_MIN = "100"
APP_TITLE = "Edge Image Gateway"
APP_DESCRIPTION = "边缘图片网关"
EMERGENCY_LOCKDOWN = "false"
ADMIN_EMAILS = "admin@example.com"
CF_ZONE_ID = "your-zone-id"

# 以下通过 wrangler secret put 设置
# GITHUB_TOKEN
# SIGN_SECRET
# CF_API_TOKEN
# ADMIN_TOTP_SECRET
# SENTRY_DSN
# TELEGRAM_BOT_TOKEN
# TELEGRAM_CHAT_ID

# Analytics Engine 绑定
[[analytics_engine_datasets]]
binding = "ANALYTICS_ENGINE"
dataset = "edge_image_gateway"
```

### Secrets 配置

敏感信息应通过 Cloudflare Dashboard 或 wrangler CLI 设置：

```bash
# 设置单个 Secret
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
npx wrangler secret put ADMIN_TOTP_SECRET

# 查看已设置的 Secret 列表（不显示值）
npx wrangler secret list

# 删除 Secret
npx wrangler secret delete GITHUB_TOKEN
```

---

## D1 动态配置

除了环境变量，大部分运行时配置通过 D1 数据库存储和管理，可通过管理面板或直接执行 D1 SQL 动态调整，无需重新部署。

### 功能开关

| D1 表/字段 | 值类型 | 说明 |
|-----------|--------|------|
| `system_config` 表 | JSON | 运行时参数（上传限制、功能开关等），通过管理面板编辑 |
| `kv_config::emergency_lockdown`（KV） | `"true"` / `"false"` | 紧急熔断开关（KV 保留项，用于运行时快速熔断） |

> 注意：`max_file_size`、`allowed_types`、`upload_prefix` 等已迁移至 D1 `system_config` 表或通过环境变量配置，不再使用 KV。

### 仓库注册表

所有仓库元数据存储在 D1 `repos` 表中，每条记录包含完整的仓库信息：

```json
{
  "id": "repo-main",
  "owner": "my-org",
  "name": "images",
  "branch": "main",
  "status": "active",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "sizeBytes": 1048576,
  "fileCount": 42,
  "capacityLimitBytes": 5368709120,
  "tokenSecretName": "GITHUB_TOKEN"
}
```

通过管理面板的「仓库管理」页面或直接查询 D1 管理：

```sql
-- 查询所有仓库
SELECT * FROM repos ORDER BY created_at DESC;

-- 查询活跃仓库
SELECT * FROM repos WHERE status = 'active';

-- 更新仓库状态
UPDATE repos SET status = 'inactive' WHERE id = 'repo-main';
```

### 路由规则

读路由规则存储在 D1 `system_config` 表中：

```json
{
  "route_rules": [
    { "prefix": "/blog", "repo": "repo-blog" },
    { "prefix": "/photos", "repo": "repo-photos", "since": "2025-06-01" }
  ]
}
```

通过管理面板的「路由规则」页面编辑，或直接操作 D1：

```sql
-- 查看当前路由规则
SELECT value FROM system_config WHERE key = 'route_rules';

-- 更新路由规则
UPDATE system_config SET value = '[
  { "prefix": "/blog", "repo": "repo-blog" },
  { "prefix": "/photos", "repo": "repo-photos" }
]' WHERE key = 'route_rules';
```

### 路径索引

文件上传后自动在 D1 `paths` 表中记录路径 → 仓库映射：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | TEXT | 文件路径，主键 |
| `repo_id` | TEXT | 所属仓库 ID |
| `sha` | TEXT | GitHub blob SHA |
| `size_bytes` | INTEGER | 文件大小 |
| `created_at` | TEXT | 创建时间 |

```sql
-- 按路径查询
SELECT * FROM paths WHERE path = '/blog/2025/photo.jpg';

-- 按前缀查询
SELECT * FROM paths WHERE path LIKE '/blog/%';
```

---

## 配置管理

### 推荐工作流

1. **初始配置** — 在 `wrangler.toml` 中设置基本环境变量
2. **Secrets 管理** — 所有敏感信息使用 `wrangler secret put` 设置
3. **动态配置** — 部署后通过管理面板或直接操作 D1 调整运行时参数
4. **多环境** — 使用 Cloudflare Workers 的 Preview / Production 环境隔离配置

### 配置验证

部署后访问以下端点验证配置是否生效：

| 端点 | 验证内容 |
|------|----------|
| `/` | 确认 APP_TITLE 和 APP_DESCRIPTION 正确显示 |
| `/healthz` | 确认环境变量配置状态和功能开关 |
| `/admin` | 确认管理认证正常工作 |
| `/{test-image}` | 确认图片可正常访问 |
| `/{test-image}?w=100` | 确认 Image Resizing 可用 |

### 多环境配置示例

```toml
# 预览环境
[env.preview]
name = "img-proxy-preview"
vars = { 
  ALLOWED_REFERERS = "preview.example.com",
  APP_TITLE = "Image Gateway (Preview)"
}

# 生产环境
[env.production]
name = "img-proxy"
vars = { 
  ALLOWED_REFERERS = "https://example.com,https://blog.example.com",
  RATE_LIMIT_PER_MIN = "200"
}
```

部署到特定环境：

```bash
# 部署到预览环境
npx wrangler deploy --env preview

# 部署到生产环境
npx wrangler deploy --env production
```

---

## 常见配置场景

### 场景一：个人博客图床

```toml
[vars]
GITHUB_USER = "your-username"
GITHUB_REPO = "blog-images"
GITHUB_BRANCH = "main"
ALLOWED_REFERERS = "https://yourblog.com"
ENABLE_SIGNATURE = "false"
RATE_LIMIT_PER_MIN = "60"
APP_TITLE = "My Blog Images"
```

### 场景二：团队共享图床（安全模式）

```toml
[vars]
GITHUB_USER = "your-org"
GITHUB_REPO = "team-images"
GITHUB_BRANCH = "main"
ALLOWED_REFERERS = "https://team-site.com,https://docs.team-site.com"
ENABLE_SIGNATURE = "true"
RATE_LIMIT_PER_MIN = "200"
ADMIN_EMAILS = "admin1@team.com,admin2@team.com"
```

### 场景三：公开 API 模式

```toml
[vars]
GITHUB_USER = "your-username"
GITHUB_REPO = "public-images"
GITHUB_BRANCH = "main"
ALLOWED_REFERERS = ""
ENABLE_SIGNATURE = "true"
RATE_LIMIT_PER_MIN = "300"
CACHE_TTL_SECONDS = "86400"
```

> 注意：`ALLOWED_REFERERS` 设为空字符串时，只允许空 Referer 的请求（如直接访问、App 请求），拒绝所有带 Referer 的外部引用。

---

## 配置校验

系统启动时会自动执行 Zod 配置校验（[src/utils/configCheck.ts](../src/utils/configCheck.ts)），确保关键配置项正确设置。

### 校验项

| 校验项 | 规则 | 说明 |
|--------|------|------|
| `GITHUB_USER` | 非空字符串 | GitHub 用户名或组织名 |
| `GITHUB_REPO` | 非空字符串 | GitHub 仓库名 |
| `GITHUB_TOKEN` | 非空字符串 | 至少 10 个字符 |
| `SIGN_SECRET` | 非空字符串 | 至少 16 个字符 |
| `ENVIRONMENT` | `production` / `development` | 用于控制错误堆栈是否暴露 |
| `RATE_LIMIT_PER_MIN` | 正整数 | 每分钟请求限制 |

### 校验结果

访问 `/healthz` 端点可查看配置校验结果：

```json
{
  "ok": true,
  "config": "valid",
  "env_configured": true,
  "features": {
    "signature": true,
    "referer_protection": true
  }
}
```

若 `config` 为 `invalid`，检查 Worker 日志获取具体的校验失败原因。

### 配置优先级

系统配置有多层来源，优先级从高到低：

1. **KV 运行时覆盖**（`kv_config::emergency_lockdown`，仅限熔断场景，即时生效）
2. **D1 动态配置**（通过管理面板或 SQL 修改，次优先，持久化存储）
3. **环境变量 Secret**（通过 `wrangler secret put` 设置）
4. **环境变量 vars**（在 `wrangler.toml` 中设置）
5. **代码默认值**

> 注意：D1 是主要的持久化配置源，KV 仅在紧急熔断等极少数场景使用。大部分配置应通过 D1 管理。

---

## 配置故障排查

### 常见配置问题

| 问题 | 症状 | 解决方法 |
|------|------|----------|
| `SIGN_SECRET` 太短 | `/healthz` 返回 `config: invalid` | 使用至少 16 字符的随机字符串 |
| `GITHUB_TOKEN` 未设置 | 上传返回 401 | 运行 `wrangler secret put GITHUB_TOKEN` |
| D1 database_id 错误 | 管理面板数据为空 | 检查 `wrangler.toml` 中 `[[d1_databases]]` 的 `database_id` |
| `ALLOWED_REFERERS` 配置错误 | 所有带 Referer 的请求返回 403 | 检查域名格式，确保不含 `http://` 之外的协议前缀差异 |
| 环境变量未生效 | 修改后行为不变 | 重新部署：`pnpm exec wrangler deploy --env production` |

### 验证配置的命令

```bash
# 查看当前 Secrets 列表
npx wrangler secret list

# 查看当前 D1 配置（紧急熔断开关）
npx wrangler d1 execute DB --command "SELECT * FROM system_config WHERE key = 'emergency_lockdown';"

# 查看当前路由规则
npx wrangler d1 execute DB --command "SELECT value FROM system_config WHERE key = 'route_rules';"

# 查看当前写仓库
npx wrangler d1 execute DB --command "SELECT * FROM repos WHERE status = 'active';"

# 健康检查
curl https://{你的域名}/healthz
```