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

1. 在 GitHub 上创建新仓库（建议为 Private）
2. 生成 Personal Access Token：
   - 访问 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - 权限：`Contents` (Read & Write)
   - 仓库：选择刚创建的仓库

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
#   id = "abc123..."
```

将输出的 `id` 填入 `wrangler.toml`。

---

## 部署步骤

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/your-username/edge-image-gateway.git
cd edge-image-gateway
pnpm install
```

### 2. 配置 wrangler.toml

```bash
copy wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，填入 KV Namespace ID 和环境变量。

### 3. 设置 Secrets

```bash
# GitHub Token (+ repo 读写权限)
npx wrangler secret put GITHUB_TOKEN

# 签名密钥（用于分享链接和内部通信）
npx wrangler secret put SIGN_SECRET
# 以上命令会提示输入值

# 可选: TOTP 管理员密钥
npx wrangler secret put ADMIN_TOTP_SECRET

# 可选: Cloudflare API Token (用于管理面板缓存清除)
npx wrangler secret put CF_API_TOKEN

# 可选: 告警配置
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
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
# Published: https://edge-image-gateway.your-account.workers.dev
```

### 6. 验证部署

```bash
# 测试首页
curl https://edge-image-gateway.your-account.workers.dev/

# 测试上传 (需配置签名)
curl -X POST \
  -F "file=@test.jpg" \
  -H "X-Signature: <generated-signature>" \
  https://edge-image-gateway.your-account.workers.dev/upload

# 测试图片访问
curl https://edge-image-gateway.your-account.workers.dev/test.jpg

# 测试管理面板
# 浏览器打开 https://edge-image-gateway.your-account.workers.dev/admin
```

---

## 配置 Cloudflare Image Resizing

图片实时处理功能需要启用 Cloudflare Image Resizing：

1. 在 Cloudflare Dashboard 中进入你的域名的 **Speed → Optimization**
2. 找到 **Image Resizing** 并启用
3. 如果使用 Images 订阅计划，可以直接使用
4. Image Resizing 仅在代理模式（Proxied）下生效，需要你的域名通过 Cloudflare 代理

> 注意：Image Resizing 需要 Cloudflare Pro/Business/Enterprise 订阅，或单独的 Images 订阅。

---

## 配置 Cloudflare Access（管理认证）

推荐使用 Cloudflare Access (Zero Trust) 保护管理面板：

1. 进入 Cloudflare Dashboard → Zero Trust → Access → Applications
2. 添加自托管应用
3. 设置应用域名为你的 Worker 域名
4. 添加策略：允许指定邮箱或邮箱后缀访问 `/admin` 路径
5. 在 `wrangler.toml` 中设置 `ADMIN_EMAILS`

如果不想使用 Cloudflare Access，可使用内置 TOTP 认证：

```bash
# 生成 TOTP 密钥并设置
npx wrangler secret put ADMIN_TOTP_SECRET
```

使用 TOTP 时，访问管理面板会提示输入 6 位验证码（可用 Google Authenticator / Authy 等 App 扫码）。

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

## 生产环境部署清单

- [ ] GitHub Token 已生成且有 `repo` 权限
- [ ] KV Namespace 已创建并配置
- [ ] 所有 Secrets 已通过 `wrangler secret put` 设置
- [ ] Cloudflare Image Resizing 已启用
- [ ] 域名已通过 Cloudflare 代理（DNS 设置为 Proxied）
- [ ] Cloudflare Access 或 TOTP 已配置
- [ ] 首次部署后已经初始化 KV 仓库注册表
- [ ] Analytics Engine 数据集已创建（如使用）
- [ ] Worker 路由已绑定到自定义域名（可选）

---

## 更新部署

```bash
# 更新 Worker
pnpm deploy

# 更新 Secrets
npx wrangler secret put GITHUB_TOKEN
```

---

## 回滚

```bash
# 查看历史版本
npx wrangler versions list

# 回滚到指定版本
npx wrangler rollback --version-id <version-id>
```