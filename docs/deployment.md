# 部署指南

## 前置准备

### 1. 创建 Cloudflare 账号

访问 [dash.cloudflare.com](https://dash.cloudflare.com/) 注册账号。

### 2. 安装工具

```bash
# 安装 Node.js (>= 18)
# 下载: https://nodejs.org/

# 安装 pnpm
npm install -g pnpm

# 安装 wrangler CLI 并登录
pnpm add -g wrangler
wrangler login
```

### 3. 创建 GitHub 仓库

创建用于存储图片的 GitHub 仓库：

1. 在 GitHub 上创建新仓库（建议设为 Private 以保护数据隐私）
2. 生成 Personal Access Token：
   - 访问 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - 权限选择：`Contents` (Read & Write)
   - 仓库选择：仅限刚创建的仓库（最小权限原则）
   - 设置合理的过期时间（建议 90 天）

### 4. 创建 Cloudflare KV Namespace

```bash
# 创建 KV Namespace
npx wrangler kv:namespace create "REPO_REGISTRY"

# 输出示例:
# 🌀  Creating namespace with title "edge-image-gateway-REPO_REGISTRY"
# ✨  Success!
# Bindings:
#   [[kv_namespaces]]
#   binding = "REPO_REGISTRY"
#   id = "abc123def456..."
```

将输出的 `id` 填入 `wrangler.toml` 的 `[[kv_namespaces]]` 配置中。

### 5. 创建 D1 数据库（可选）

如果使用 D1 作为主索引（推荐），需要创建 D1 数据库：

```bash
# 创建 D1 数据库
npx wrangler d1 create edge-image-gateway-db

# 输出示例:
# ✅  Successfully created DB 'edge-image-gateway-db'
# [[d1_databases]]
# binding = "DB"
# database_name = "edge-image-gateway-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

将输出的 `database_id` 填入 `wrangler.toml` 的 `[[d1_databases]]` 配置中。

### 6. 创建 R2 Bucket（可选）

```bash
# 创建 R2 Bucket（用于图片变体缓存）
npx wrangler r2 bucket create edge-image-gateway-cache
```

将 bucket 名称填入 `wrangler.toml` 的 `[[r2_buckets]]` 配置中。

---

## 部署步骤

### 1. 克隆项目并安装依赖

```bash
git clone <repo-url>
cd edge-image-gateway
pnpm install
```

### 2. 配置 wrangler.toml

```bash
copy wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，填入：
- KV Namespace ID
- GitHub 用户名和仓库名
- 其他可选环境变量

### 3. 设置 Secrets

```bash
# GitHub Token（需要 repo 读写权限）
npx wrangler secret put GITHUB_TOKEN

# 签名密钥（用于分享链接和内部通信）
npx wrangler secret put SIGN_SECRET

# 可选：TOTP 管理员密钥
npx wrangler secret put ADMIN_TOTP_SECRET

# 可选：Cloudflare API Token（用于管理面板缓存清除）
npx wrangler secret put CF_API_TOKEN

# 可选：告警配置
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID

# 可选：错误监控
npx wrangler secret put SENTRY_DSN
```

### 4. 初始化 KV 配置

部署后首次访问管理面板，系统会自动初始化默认配置。

如需手动初始化：

```bash
# 设置默认仓库
npx wrangler kv:key put \
  --binding=REPO_REGISTRY \
  "repo::default" \
  '{"id":"default","owner":"YOUR_USER","name":"YOUR_REPO","branch":"main","status":"active","createdAt":"2025-01-01T00:00:00.000Z","sizeBytes":0,"fileCount":0,"capacityLimitBytes":5368709120,"tokenSecretName":"GITHUB_TOKEN"}'

# 设置当前写仓库
npx wrangler kv:key put \
  --binding=REPO_REGISTRY \
  "route::current_write" "default"
```

### 5. 部署

```bash
# 部署到 Cloudflare Workers
pnpm deploy

# 输出示例:
# Total Upload: xx KB
# ...
# Published: https://edge-image-gateway.{your-account}.workers.dev
```

### 6. 验证部署

```bash
# 测试健康检查
curl https://{你的域名}/healthz

# 测试首页
curl https://{你的域名}/

# 测试图片上传（需配置签名）
curl -X POST \
  -F "file=@test.jpg" \
  -H "X-Signature: <generated-signature>" \
  https://{你的域名}/upload

# 测试管理面板
# 浏览器打开 https://{你的域名}/admin
```

---

## 配置 Cloudflare Image Resizing

图片实时处理功能需要启用 Cloudflare Image Resizing：

1. 在 Cloudflare Dashboard 中进入你的域名的 **Speed → Optimization**
2. 找到 **Image Resizing** 并启用
3. 如果使用 Images 订阅计划，可以直接使用
4. Image Resizing 仅在代理模式（Proxied）下生效，需要你的域名通过 Cloudflare 代理

> **注意：** Image Resizing 需要 Cloudflare Pro / Business / Enterprise 订阅，或单独的 Images 订阅。

---

## 配置 Cloudflare Access（管理认证）

推荐使用 Cloudflare Access (Zero Trust) 保护管理面板：

1. 进入 [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. 进入 **Access → Applications**，点击 **Add an application**
3. 选择 **Self-hosted**
4. 设置应用域名为你的 Worker 域名
5. 添加策略：允许指定邮箱或邮箱后缀访问 `/admin` 路径
6. 在 `wrangler.toml` 中设置 `ADMIN_EMAILS` 白名单

如果不想使用 Cloudflare Access，可使用内置 TOTP 认证：

```bash
# 生成 TOTP 密钥并设置
npx wrangler secret put ADMIN_TOTP_SECRET
```

使用 TOTP 时，访问管理面板会提示输入 6 位验证码（可用 Google Authenticator / Authy / 1Password 等 App 扫码添加）。

---

## 配置 Sentry（错误监控）

```bash
npx wrangler secret put SENTRY_DSN
```

Sentry 会自动捕获 Workers 运行时的未捕获异常并上报。

---

## 配置 Telegram 告警

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

当触发热阈值（如 GitHub API 速率剩余不足 1000）时，系统会通过 Telegram Bot 发送告警。

---

## 配置 Analytics Engine

在 `wrangler.toml` 中添加：

```toml
[[analytics_engine_datasets]]
binding = "ANALYTICS_ENGINE"
dataset = "edge_image_gateway"
```

在 Cloudflare Dashboard 中创建同名数据集即可开始收集请求指标。

---

## 配置 Cron 触发器

在 `wrangler.toml` 中添加 Cron 触发器以自动同步仓库统计：

```toml
[triggers]
crons = ["0 */6 * * *"]  # 每 6 小时执行一次
```

---

## 绑定自定义域名

1. 在 Cloudflare Dashboard 中进入 Workers & Pages
2. 选择你的 Worker，进入 **Triggers** 标签页
3. 在 **Custom Domains** 中添加你的域名
4. 确保域名 DNS 已通过 Cloudflare 代理（橙色云朵图标）

---

## 生产环境部署清单

- [ ] GitHub Token 已生成且有 `repo` 权限（Fine-grained，最小权限）
- [ ] KV Namespace 已创建并配置
- [ ] D1 数据库已创建并初始化 Schema（如使用）
- [ ] R2 Bucket 已创建（如使用）
- [ ] 所有 Secrets 已通过 `wrangler secret put` 设置
- [ ] Cloudflare Image Resizing 已启用（如需要图片处理功能）
- [ ] 域名已通过 Cloudflare 代理（DNS 设置为 Proxied）
- [ ] Cloudflare Access 或 TOTP 已配置
- [ ] 首次部署后已经初始化 KV 仓库注册表
- [ ] Cron 触发器已配置（如需要自动同步统计）
- [ ] Analytics Engine 数据集已创建（如使用）
- [ ] Worker 路由已绑定到自定义域名（可选）
- [ ] 已测试所有核心功能（上传、访问、管理面板）

---

## 更新部署

```bash
# 更新 Worker
pnpm deploy

# 更新 Secrets
npx wrangler secret put GITHUB_TOKEN

# 更新环境变量（编辑 wrangler.toml 后重新部署）
pnpm deploy
```

---

## 回滚

```bash
# 查看历史版本
npx wrangler versions list

# 回滚到指定版本
npx wrangler rollback --version-id <version-id>
```

---

## 故障排查

### 部署失败

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| `Authentication error` | wrangler 未登录 | 运行 `wrangler login` 重新登录 |
| `KV namespace not found` | KV ID 不正确 | 检查 `wrangler.toml` 中的 KV ID |
| `Script size exceeded` | Worker 代码过大 | 删除不必要的依赖，使用动态导入 |
| `Secret not found` | Secret 未设置 | 运行 `wrangler secret put` 设置缺失的 Secret |

### 运行时问题

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 图片返回 404 | GitHub 仓库中不存在 | 检查文件是否已上传到正确的仓库 |
| 上传返回 401 | 签名认证未配置 | 检查 `ENABLE_SIGNATURE` 和 `X-Signature` 头 |
| 管理面板无法访问 | 认证配置错误 | 检查 `ADMIN_EMAILS` 或 TOTP 配置 |
| 图片处理不生效 | 未启用 Image Resizing | 检查 Cloudflare Image Resizing 是否已启用 |
| GitHub API 限流 | 请求过于频繁 | 增加缓存 TTL，减少对 GitHub API 的直接请求 |

### 查看日志

```bash
# 实时查看生产日志
npx wrangler tail

# 仅查看错误
npx wrangler tail --status error

# 通过 Cloudflare Dashboard
# Workers & Pages → 你的 Worker → Logs
```