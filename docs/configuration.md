# 配置说明

## 概览

Edge Image Gateway 的配置分为三个层次：

1. **环境变量 / Secrets** — 在 `wrangler.toml` 或 Cloudflare Dashboard 中配置
2. **KV 动态配置** — 通过管理面板或直接操作 KV 的运行时配置
3. **wrangler 配置** — Workers 部署配置文件

---

## 环境变量

### 必需变量

| 变量 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `GITHUB_USER` | 明文 | GitHub 用户名或组织名 | `my-username` |
| `GITHUB_REPO` | 明文 | 默认的 GitHub 仓库名 | `my-image-hosting` |
| `GITHUB_BRANCH` | 明文 | 仓库分支 | `main` |
| `GITHUB_TOKEN` | **Secret** | GitHub Personal Access Token，需要 `repo` 权限 | `ghp_xxx` |
| `SIGN_SECRET` | **Secret** | HMAC 签名密钥，用于分享链接和内部回环认证 | 随机字符串 |

### 可选变量

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
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

参考 [wrangler.toml.example](../wrangler.toml.example)：

```toml
name = "edge-image-gateway"
main = "src/index.ts"
compatibility_date = "2024-05-31"

# KV Namespace 绑定
[[kv_namespaces]]
binding = "REPO_REGISTRY"
id = "your-kv-namespace-id"

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

# Secrets (通过 wrangler secret put 设置)
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
# 设置 Secret
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
npx wrangler secret put ADMIN_TOTP_SECRET

# 批量设置（使用 wrangler secret bulk）
npx wrangler secret bulk < secrets.json
```

---

## KV 动态配置

除了环境变量，部分配置可通过 KV 运行时动态调整，无需重新部署。

### 功能开关

| KV 键 | 值类型 | 说明 |
|-------|--------|------|
| `kv_config::emergency_lockdown` | `"true"` / `"false"` | 紧急熔断 |
| `kv_config::max_file_size` | 数字字符串（字节） | 上传文件大小上限 |
| `kv_config::allowed_types` | 逗号分隔的 MIME 类型 | 允许上传的文件类型 |
| `kv_config::upload_prefix` | 路径字符串 | 上传文件的默认前缀路径 |

### 仓库注册表

通过 KV 管理多仓库配置，每个仓库键为 `repo::{id}`，值为 RepoMeta JSON：

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

### 路由规则

读路由规则存储在 `route::read_rules` 键中：

```json
[
  { "prefix": "/blog", "repo": "repo-blog" },
  { "prefix": "/photos", "repo": "repo-photos", "since": "2025-06-01" }
]
```

---

## 配置管理

### 推荐工作流

1. **初始配置** — 在 `wrangler.toml` 中设置基本环境变量
2. **Secrets 管理** — 所有敏感信息使用 `wrangler secret put` 设置
3. **动态配置** — 部署后通过管理面板或直接操作 KV 调整运行时参数
4. **多环境** — 使用 Cloudflare Workers 的 Preview / Production 环境隔离配置

### 配置验证

部署后访问以下端点验证配置是否生效：

- 首页 `/` — 确认 APP_TITLE 和 APP_DESCRIPTION 正确显示
- 管理面板 `/admin` — 确认管理认证正常工作
- 图片请求 `/{test-image}` — 确认图片可正常访问
- 带参数请求 `/{test-image}?w=100` — 确认 Image Resizing 可用