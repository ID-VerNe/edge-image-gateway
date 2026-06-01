# 部署指南

## 手动部署

### 前置条件

1. 确保已完成所有配置（详见 [配置参考](./configuration.md)）
2. 确保已设置所有必需的 Secrets
3. 拥有 Cloudflare 账户并配置了 Workers 域名

### 部署步骤

#### 1. 配置 wrangler.toml

```bash
cp wrangler.toml.example wrangler.toml
```

编辑文件，填入以下信息：

```toml
name = "picbed-cf-github"
main = "src/index.ts"
compatibility_date = "2024-05-31"

[vars]
GITHUB_USER = "your-github-username"
GITHUB_REPO = "your-storage-repo"
GITHUB_BRANCH = "main"
ALLOWED_REFERERS = "yourdomain.com"
CACHE_TTL_SECONDS = "604800"
ENABLE_SIGNATURE = "false"
RATE_LIMIT_PER_MIN = "120"

[[kv_namespaces]]
binding = "REPO_REGISTRY"
id = "your-kv-namespace-id"
```

#### 2. 创建 KV 命名空间（如未创建）

```bash
npx wrangler kv namespace create REPO_REGISTRY
```

将输出的 `id` 填入 `wrangler.toml`。

#### 3. 设置 Secrets

```bash
npx wrangler secret put GITHUB_TOKEN
# 输入你的 GitHub Personal Access Token

npx wrangler secret put SIGN_SECRET
# 输入签名密钥（可选，启用签名时需要）
```

#### 4. 部署

```bash
pnpm deploy
```

该命令会构建并部署 Worker 到 Cloudflare 边缘网络。

#### 5. 验证部署

```bash
curl https://your-worker-domain/healthz
```

预期返回：

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  ...
}
```

---

## CI/CD 自动部署

项目已配置 GitHub Actions 自动部署工作流。

### 工作流文件

`.github/workflows/deploy.yml` 包含完整的 CI/CD 管道：

```yaml
name: Deploy
on:
  push:
    branches: [main]    # 推送 main 分支时触发生产部署
  pull_request:         # PR 时触发预览部署

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - name: Deploy
        run: pnpm deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### GitHub Secrets 配置

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中设置：

| Secret 名称 | 说明 | 获取方式 |
|------------|------|----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | Cloudflare Dashboard → My Profile → API Tokens（权限：Workers 编辑） |
| `GITHUB_TOKEN` | GitHub PAT | GitHub Settings → Developer settings → Personal access tokens |
| `SIGN_SECRET` | 签名密钥（可选） | 随机生成 |

### CI/CD 流程说明

#### 生产部署（推送到 main）

1. 检出代码
2. 安装依赖（pnpm）
3. 运行类型检查（`pnpm typecheck`）
4. 运行测试（`pnpm test`）
5. 通过 Wrangler 部署到生产环境

#### 预览部署（PR）

1. 检出 PR 分支代码
2. 安装依赖
3. 运行类型检查和测试
4. 通过 Wrangler 部署到预览环境
5. 在 PR 评论中生成预览 URL

---

## 环境管理

### 多环境配置

`wrangler.toml` 支持多环境配置：

```toml
[env.preview]
name = "picbed-preview"
vars = { ALLOWED_REFERERS = "preview.yourdomain.com" }

[env.production]
name = "picbed"
```

### 部署到指定环境

```bash
# 生产环境
pnpm deploy

# 预览环境
npx wrangler deploy --env preview
```

---

## 配置 Cloudflare Access（管理后台认证）

### 步骤

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Zero Trust → Access → Applications
3. 点击 "Add an application"，选择 "Self-hosted"
4. 配置应用信息：
   - **Application name**: `Picbed Admin`
   - **Session Duration**: `24h`
   - **Application domain**: 选择你的 Worker 域名
   - **Path**: `/admin`
5. 配置访问策略（Policy）：
   - **Policy name**: `Allow my domain`
   - **Action**: `Allow`
   - **Rules**: 例如 `Emails ending in: @yourdomain.com`
6. 保存配置

### 验证

访问 `https://your-worker-domain/admin`，应自动跳转到 Cloudflare Access 登录页面。

---

## 配置自定义域名

### 步骤

1. 在 Cloudflare Dashboard 中，进入你的域名 DNS 设置
2. 添加一条 CNAME 记录：
   - **Type**: CNAME
   - **Name**: 子域名（如 `img`）
   - **Target**: 你的 Worker 域名（如 `picbed-cf-github.your-account.workers.dev`）
   - **Proxy**: 开启（橙色云朵）
3. 在 Worker 的 Triggers 选项卡中，添加自定义域名路由
4. 更新 `wrangler.toml` 中的 `ALLOWED_REFERERS` 为新的自定义域名

---

## 部署后验证清单

- [ ] 健康检查端点返回 200
- [ ] 图片 URL 可正常访问
- [ ] 图片缩放参数生效（`?w=200`）
- [ ] 管理后台可正常登录
- [ ] 文件上传功能正常
- [ ] 防盗链正常工作（非白名单域名返回 403）
- [ ] 限流正常工作（高频请求返回 429）
- [ ] 缓存生效（响应头包含 `CF-Cache-Status: HIT`）

---

## 回滚

如果需要回滚到之前的版本：

### 通过 Wrangler 回滚

```bash
# 查看部署版本
npx wrangler deployments list

# 回滚到指定版本
npx wrangler rollback --version <version-id>
```

### 通过 Git + CI/CD 回滚

```bash
git revert HEAD
git push origin main
```

CI/CD 会自动部署回滚后的版本。

---

## 监控与日志

### Cloudflare Dashboard

在 Cloudflare Dashboard 中可以查看：
- **Worker 调用次数**：请求量统计
- **CPU 时间**：计算资源消耗
- **带宽**：数据传输量
- **错误率**：5xx 错误统计

### Workers 日志

在 Worker 的 Logs 选项卡中可以查看实时日志。日志采用 JSON 格式输出，包含以下字段：

```json
{
  "level": "info",
  "message": "Image served",
  "requestId": "abc123",
  "path": "/2026/photo.jpg",
  "status": 200,
  "duration": 45,
  "repo": "default-repo"
}
```

### 告警设置

在 Cloudflare Dashboard 中可设置告警规则：
- 错误率超过阈值
- 调用次数异常增长
- 响应时间过长