# 配置参考

## 配置文件

项目使用 `wrangler.toml` 进行配置。请复制模板文件并根据环境修改：

```bash
cp wrangler.toml.example wrangler.toml
```

> **安全提醒**：`wrangler.toml` 已被加入 `.gitignore`，避免敏感信息泄露。

---

## 环境变量

| 变量名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `GITHUB_USER` | string | 是 | - | GitHub 用户名 |
| `GITHUB_REPO` | string | 是 | - | 默认的存储仓库名 |
| `GITHUB_BRANCH` | string | 否 | `main` | Git 分支 |
| `APP_TITLE` | string | 否 | `Private Picbed` | 管理后台页面标题 |
| `APP_DESCRIPTION` | string | 否 | `Ready to serve images.` | 管理后台页面描述 |
| `ALLOWED_REFERERS` | string | 否 | `""`(关闭) | 防盗链域名白名单，逗号分隔 |
| `CACHE_TTL_SECONDS` | number | 否 | `604800`(7天) | 边缘缓存过期时间 |
| `ENABLE_SIGNATURE` | boolean | 否 | `false` | 是否启用全局签名保护 |
| `RATE_LIMIT_PER_MIN` | number | 否 | `120` | 每分钟每 IP 请求限制 |
| `EMERGENCY_LOCKDOWN` | boolean | 否 | `false` | 紧急熔断开关 |

---

## Secrets

Secrets 通过 Cloudflare 加密存储，使用 Wrangler CLI 设置，不可从代码中读取。

| Secret 名 | 必填 | 说明 | 生成方式 |
|-----------|------|------|----------|
| `GITHUB_TOKEN` | 是 | GitHub PAT，需 `Contents: Read and write` 权限 | GitHub Settings → Developer settings → Personal access tokens |
| `SIGN_SECRET` | 否 | HMAC 签名密钥，启用签名时需要 | 建议 `openssl rand -hex 32` 随机生成 |

设置 Secrets：

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

---

## KV 命名空间

项目使用 Cloudflare KV 存储多仓库注册信息。

### 创建 KV 命名空间

```bash
npx wrangler kv namespace create REPO_REGISTRY
```

将输出的 `id` 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "REPO_REGISTRY"
id = "your-kv-namespace-id"
```

### KV 数据结构

KV 中存储的数据格式如下：

```typescript
// 仓库元数据（key: repo::{id}）
{
  "id": "my-repo",
  "owner": "github-username",
  "name": "storage-repo",
  "branch": "main",
  "status": "active",           // active | readonly | draining | archived
  "createdAt": "2024-01-01T00:00:00.000Z",
  "sizeBytes": 1048576,
  "fileCount": 42,
  "capacityLimitBytes": 5368709120,  // 5GB
  "tokenSecretName": "GITHUB_TOKEN"
}

// 当前写仓库（key: route::current_write）
"my-repo"
```

---

## 环境管理

### 双环境配置

支持 `preview` 和 `production` 两个环境：

```toml
[env.preview]
name = "picbed-preview"
vars = { ALLOWED_REFERERS = "preview.yourdomain.com" }

[env.production]
name = "picbed"
```

部署到指定环境：

```bash
# 生产环境
pnpm deploy

# 预览环境
npx wrangler deploy --env preview
```

### 示例配置模板

```toml
name = "picbed-cf-github"
main = "src/index.ts"
compatibility_date = "2024-05-31"

[vars]
GITHUB_USER = "YOUR_GITHUB_USERNAME"
GITHUB_REPO = "YOUR_STORAGE_REPO_NAME"
GITHUB_BRANCH = "main"
APP_TITLE = "My Private Picbed"
APP_DESCRIPTION = "Ready to serve images from private storage."
ALLOWED_REFERERS = ""
CACHE_TTL_SECONDS = "604800"
ENABLE_SIGNATURE = "false"
RATE_LIMIT_PER_MIN = "120"

[[kv_namespaces]]
binding = "REPO_REGISTRY"
id = "YOUR_KV_NAMESPACE_ID"
```