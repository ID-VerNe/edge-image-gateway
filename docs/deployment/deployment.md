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

### 5. 创建 D1 数据库

D1 是项目的主数据库，所有数据（文件元数据、仓库配置、认证令牌、审计日志等）均存储在 D1 中，**必须创建**：

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

### 4. 初始化 D1 数据库 Schema

部署前需要初始化 D1 数据库的表结构：

```bash
# 初始化 D1 数据库 schema
npx wrangler d1 execute edge-image-gateway-db --file=scripts/schema.sql --env production
```

首次部署后访问管理面板，系统会自动初始化默认配置。

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
- [ ] KV Namespace 已创建并配置（用于速率限制）
- [ ] D1 数据库 Schema 已初始化
- [ ] R2 Bucket 已创建（如使用）
- [ ] 所有 Secrets 已通过 `wrangler secret put` 设置
- [ ] Cloudflare Image Resizing 已启用（如需要图片处理功能）
- [ ] 域名已通过 Cloudflare 代理（DNS 设置为 Proxied）
- [ ] Cloudflare Access 或 TOTP 已配置
- [ ] Cron 触发器已配置（如需要自动同步统计）
- [ ] Analytics Engine 数据集已创建（如使用）
- [ ] Worker 路由已绑定到自定义域名（可选）
- [ ] 已测试所有核心功能（上传、访问、管理面板）

---

## 生产环境优化建议

### 性能优化

| 优化项 | 建议 | 说明 |
|--------|------|------|
| 缓存 TTL | 设置 `CACHE_TTL_SECONDS=604800`（7 天） | 最大化缓存命中率，减少 GitHub API 调用 |
| R2 缓存 | 确保 R2 Bucket 已创建并绑定 | 分担 GitHub API 读取压力，加速图片变体响应 |
| 速率限制 | 根据流量调整 `RATE_LIMIT_PER_MIN` | 默认 120，高流量站点可调至 300-600 |
| Cron 频率 | 建议每 6 小时执行一次 | 平衡容量同步及时性与 GitHub API 消耗 |

### 安全加固

| 加固项 | 建议 |
|--------|------|
| 签名认证 | 生产环境建议 `ENABLE_SIGNATURE=true` |
| 防盗链 | 配置 `ALLOWED_REFERERS` 为你的域名 |
| 管理认证 | 配置 Cloudflare Access 或 TOTP |
| Token 轮换 | GitHub Token 每 90 天轮换一次 |
| 审计日志 | 每周审查一次审计日志 |

### 监控配置

| 监控项 | 配置方式 |
|--------|----------|
| 错误追踪 | 设置 `SENTRY_DSN` |
| 实时告警 | 设置 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| 指标分析 | 创建 Analytics Engine 数据集并绑定 |
| 日志查看 | 使用 `wrangler tail` 实时查看生产日志 |

### 成本控制

| 项目 | 免费额度 | 超过后的建议 |
|------|----------|-------------|
| Workers 请求 | 10 万次/天 | 优化缓存策略，减少 Worker 调用 |
| D1 读取 | 500 万行/天 | 优化查询，使用索引 |
| R2 存储 | 10 GB | 使用较小的图片格式，定期清理无用变体 |

### 长期维护

| 任务 | 频率 | 说明 |
|------|------|------|
| 依赖更新 | 每月 | `pnpm update` 更新 wrangler、hono 等 |
| GitHub Token 轮换 | 每 90 天 | 在 GitHub Settings 中重新生成 |
| SIGN_SECRET 轮换 | 每 180 天 | 更新后需重新生成所有分享链接 |
| 容量审查 | 每月 | 检查仓库容量，提前扩容或迁移 |
| 审计日志清理 | 每季度 | 删除超过 90 天的审计日志 |

---

## 更新部署

### 手动部署

```bash
# 更新 Worker
pnpm deploy

# 更新 Secrets
npx wrangler secret put GITHUB_TOKEN

# 更新环境变量（编辑 wrangler.toml 后重新部署）
pnpm deploy
```

### 通过 CI/CD 自动部署

项目已内置 GitHub Actions 工作流，配置后每次推送到 `master` 分支即可自动部署。

**配置步骤：**

1. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加以下 Secrets：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers 部署权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

2. 推送代码到 `master` 分支即可自动触发生产部署。

3. 创建 Pull Request 时自动部署到预览环境。

> 工作流定义见 [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)。

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