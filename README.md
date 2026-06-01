# Picbed CF GitHub

> 基于 **Cloudflare Workers + Hono + GitHub 私有仓库** 构建的生产级私有图床服务

![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Hono](https://img.shields.io/badge/Hono-4.x-orange)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-Workers-yellow)
![Vitest](https://img.shields.io/badge/Vitest-4.x-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 项目简介

Picbed CF GitHub 是一个运行在 Cloudflare Workers 边缘网络上的私有图床服务。它将图片存储在 GitHub 私有仓库中，通过 Edge Worker 对外提供安全、快速的图片访问服务。适用于个人博客、Markdown 笔记、社交媒体分享等场景。

**主要优势**：

- **零服务器成本**：利用 Cloudflare Workers 免费额度和 GitHub 免费私有仓库，无需托管任何后端服务器。
- **全球加速**：通过 Cloudflare 边缘缓存，图片在全球范围内高速加载。
- **安全可控**：图片存储在私有仓库中，对外访问受多层安全策略保护。

---

## 核心特性

### 存储层

- **GitHub 私有仓库存储**：图片源文件存放在 GitHub 私有仓库中，安全可靠，无容量限制（建议单仓库 < 5GB）。
- **原始文件直出**：通过 GitHub Contents API（`application/vnd.github.raw`）以流式方式获取原始文件内容。
- **多类型支持**：不仅支持常见图片格式（PNG、JPEG、WebP、AVIF、GIF、SVG），也可托管视频（MP4、WebM）及其他静态文件。

### 边缘处理

- **动态图片缩放**：支持通过 URL 查询参数（`?w=800`）在边缘节点实时调整图片尺寸、质量。
- **自动格式协商**：Cloudflare Image Resizing 自动根据客户端能力选择 WebP/AVIF 等现代格式。
- **回环代理模式**：独创的"回环代理"架构，完美解决 Cloudflare 缩放引擎无法直接抓取 GitHub 私有仓库内容的问题（HTTP 415 错误）。当需要缩放时，Worker 构造带内部签名的请求回调自身，缩放引擎在 Worker 内部完成图片获取与缩放。
- **智能降级**：缩放失败时（如未启用 Image Resizing），自动回退到原始图片，保证服务不中断。

### 混合防御安全模型

| 防线 | 层级 | 说明 |
|------|------|------|
| **防盗链** | 应用层 | 基于 Referer/Origin 请求头的域名白名单，配合 `Sec-Fetch-Dest` 校验，阻止外部盗链。 |
| **HMAC 签名** | 应用层 | 对图片提供带有效期的 HMAC-SHA256 签名链接，实现临时安全分享。 |
| **限流保护** | 应用层 | 基于 `CF-Connecting-IP` 的请求频率限制，含 404 惩罚机制（单 IP 每分钟超 20 次 404 自动封禁 5 分钟）。 |
| **目录分级** | 应用层 | `/private/`、`/draft/`、`/raw/` 路径强制签名，Referer 不豁免。 |
| **紧急熔断** | 应用层 | `EMERGENCY_LOCKDOWN` 开关开启后，全站所有请求均需有效签名方可访问。 |
| **响应脱敏** | 应用层 | 自动剥离响应头中的 `X-GitHub-*`、`Server`、`Set-Cookie` 等信息，隐藏后端架构。 |
| **路径安全** | 应用层 | 禁止路径穿越攻击（`..`），防止访问仓库外的资源。 |

### 运维特性

- **Cloudflare 边缘缓存**：利用 Cache API 缓存已请求的图片，减少 GitHub API 调用，大幅提升响应速度。
- **结构化日志**：JSON 格式的结构化日志输出，便于在 Cloudflare Dashboard 中检索和分析。
- **GitHub Actions CI/CD**：推送代码到 `main` 分支即自动部署到生产环境，PR 自动部署预览环境。
- **PicGo 集成**：与 PicGo 图床客户端无缝对接，支持上传后自动生成自定义域名链接。
- **健康检查端点**：`/healthz` 提供环境配置状态检查和版本信息。

---

## 技术架构

```
┌──────────────────────────────────────────────────────┐
│                   用户请求（浏览器）                     │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│               Cloudflare Workers 边缘节点               │
│  ┌────────────────────────────────────────────────┐  │
│  │                 Hono 框架路由                     │  │
│  ├────────────────────────────────────────────────┤  │
│  │  限流中间件  │  防盗链中间件  │  签名验证中间件      │  │
│  │  (含404惩罚)  │ (Referer校验) │ (目录分级+熔断)    │  │
│  ├────────────────────────────────────────────────┤  │
│  │             图片请求处理器 (image.ts)              │  │
│  │  ┌─────────────────┐  ┌──────────────────┐    │  │
│  │  │   Cache API      │  │  回环代理缩放      │    │  │
│  │  │   (边缘缓存)      │  │  (Image Resizing) │    │  │
│  │  └─────────────────┘  └──────────────────┘    │  │
│  └───────────────────────┬────────────────────────┘  │
└──────────────────────────┼───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│              GitHub API (api.github.com)              │
│  ┌────────────────────────────────────────────────┐  │
│  │         GitHub 私有仓库 (图片二进制存储)           │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 项目结构

```
picbed-cf-GitHub/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD 部署配置
├── scripts/
│   └── sign.ts                 # HMAC 签名链接生成脚本
├── src/
│   ├── middleware/
│   │   ├── rateLimit.ts        # IP 级请求频率限制（含 404 惩罚封禁）
│   │   ├── referer.ts          # Referer/Origin 防盗链中间件
│   │   └── signature.ts        # HMAC 签名验证 + 紧急熔断 + 目录分级
│   ├── routes/
│   │   └── image.ts            # 核心图片请求处理（缓存、回环缩放、响应脱敏）
│   ├── services/
│   │   └── github.ts           # GitHub Contents API 交互服务
│   ├── types/
│   │   └── env.d.ts            # 环境变量与 Secrets 类型定义
│   ├── utils/
│   │   ├── hmac.ts             # HMAC-SHA256 签名生成工具
│   │   ├── logger.ts           # 结构化 JSON 日志工具
│   │   └── mime.ts             # MIME 类型映射工具
│   └── index.ts                # 应用入口，Hono 路由与中间件注册
├── tests/
│   └── index.spec.ts           # 单元测试（Vitest + Cloudflare Workers 模拟）
├── .gitignore
├── package.json                # 项目依赖与脚本
├── wrangler.toml.example       # 配置文件模板
└── README.md                   # 项目文档
```

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 18+（推荐使用 20.x LTS）
- [pnpm](https://pnpm.io/) 包管理器
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（Cloudflare Workers 命令行工具）
- Cloudflare 账户（免费即可）
- GitHub 账户

### 第一步：GitHub 准备

1. 创建一个 **私有 (Private)** 仓库用于存放图片（例如：`picbed-storage`）。
2. 生成一个 **Fine-grained Personal Access Token (PAT)**：
   - 访问 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - 设置权限：`Contents` - `Read and write`（上传图片需要写权限）
   - Repository access：仅限上述存储仓库

### 第二步：安装依赖

```bash
pnpm install
```

### 第三步：配置项目

1. 复制配置文件模板：

```bash
cp wrangler.toml.example wrangler.toml
```

2. 编辑 `wrangler.toml`，修改以下变量：

```toml
[vars]
GITHUB_USER = "your-github-username"
GITHUB_REPO = "your-storage-repo-name"
GITHUB_BRANCH = "main"

APP_TITLE = "My Private Picbed"
APP_DESCRIPTION = "Ready to serve images from private storage."

ALLOWED_REFERERS = "yourblog.com,another-site.com"
CACHE_TTL_SECONDS = "604800"
ENABLE_SIGNATURE = "false"
RATE_LIMIT_PER_MIN = "120"
```

### 第四步：设置 Secrets

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

> **安全提示**：`GITHUB_TOKEN` 和 `SIGN_SECRET` 通过 Cloudflare Secrets 加密存储，永远不会出现在代码仓库中。

### 第五步：本地测试

```bash
pnpm dev
```

访问 `http://localhost:8787/healthz` 检查服务是否正常运行。

### 第六步：部署

```bash
pnpm deploy
```

---

## 运行手册

### 图片缩放参数

通过 URL 查询参数控制图片缩放：

| 参数 | 说明 | 示例 |
|------|------|------|
| `w` | 目标宽度（像素） | `?w=800` |
| `h` | 目标高度（像素） | `?h=600` |
| `q` | 输出质量（1-100） | `?q=80` |
| `fit` | 缩放模式 | `?fit=cover` |

**缩放模式说明**：

| fit 值 | 说明 |
|--------|------|
| `cover` | 裁剪填充（默认），保持比例裁剪至目标尺寸 |
| `contain` | 完整显示，留白填充 |
| `fill` | 拉伸填充，不保持比例 |
| `inside` | 缩放至不超过目标尺寸 |

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/healthz` | GET | 健康检查，返回版本、环境配置状态与启用的安全特性 |
| `/{imagePath}` | GET | 公开图片访问，支持缩放参数 |
| `/private/{imagePath}` | GET | 私有图片访问，需要 HMAC 签名 |
| `/draft/{imagePath}` | GET | 草稿图片访问，需要 HMAC 签名（强制签名路径） |
| `/raw/{imagePath}` | GET | 原始文件访问，需要 HMAC 签名（强制签名路径） |

**示例**：

```bash
# 公开访问（800px 宽，自动格式协商）
https://img.example.com/images/photo.png?w=800

# 私有分享链接（带签名，1 小时有效）
https://img.example.com/private/photo.png?sig=abc123&exp=1717171717
```

### PicGo 集成

在 PicGo 的 GitHub 图床设置中配置：

| 配置项 | 值 |
|--------|-----|
| **仓库名** | `用户名/仓库名` |
| **Token** | 你的 GitHub PAT |
| **自定义域名** | `https://img.yourdomain.com` |
| **分支** | `main` |

配置完成后，PicGo 上传图片后会自动生成自定义域名链接。

---

## 安全配置

### 混合防御模型

本项目通过七层纵深防御体系，在**博客引用的便利性**与**防全库被盗/爬取**之间取得平衡。各层可独立启用/关闭，按需组合。

#### 防盗链配置

在 `wrangler.toml` 中设置 `ALLOWED_REFERERS`，用逗号分隔允许的域名：

```toml
[vars]
ALLOWED_REFERERS = "yourblog.com,another-site.com"
```

- 支持子域名：`*.yourblog.com`
- 空值表示禁用防盗链检查
- 请求头中的 `Referer` 或 `Origin` 需匹配白名单
- 配合 `Sec-Fetch-Dest: image` 头校验，进一步过滤非浏览器请求

#### 签名保护

启用签名保护后，`/private/`、`/draft/`、`/raw/` 路径下的图片必须携带有效签名才能访问。配置：

```toml
[vars]
ENABLE_SIGNATURE = "true"
```

**生成签名链接**：

```bash
npx tsx scripts/sign.ts /private/image.png 3600 <your_secret>
```

参数说明：
- 第一个参数：图片路径
- 第二个参数：有效期（秒）
- 第三个参数：签名密钥（与 `SIGN_SECRET` 一致）

输出示例：
```
/private/image.png?sig=abc123&exp=1717171717
```

#### 紧急熔断开关

在极端情况下（如被爬虫攻击），可通过环境变量一键启用全站强制签名：

```toml
[vars]
EMERGENCY_LOCKDOWN = "true"
```

开启后，所有请求均需携带有效签名方可访问，部署后 30 秒内生效。

#### 限流配置

基于 `CF-Connecting-IP` 进行 IP 级限流：

```toml
[vars]
RATE_LIMIT_PER_MIN = "120"
```

超过限制将返回 `429 Too Many Requests` 响应。

**404 惩罚机制**：若单 IP 在一分钟内产生超过 20 次 404 请求，将被自动封禁 5 分钟（返回 `403 Forbidden`），有效防御字典遍历攻击。

---

## 配置参考

### 环境变量

| 变量名 | 类型 | 必填 | 说明 | 默认值 |
|--------|------|------|------|--------|
| `GITHUB_USER` | string | 是 | GitHub 用户名 | - |
| `GITHUB_REPO` | string | 是 | 存储仓库名 | - |
| `GITHUB_BRANCH` | string | 否 | Git 分支 | `main` |
| `APP_TITLE` | string | 否 | 应用标题（首页展示） | `Private Picbed` |
| `APP_DESCRIPTION` | string | 否 | 应用描述 | `Ready to serve images.` |
| `ALLOWED_REFERERS` | string | 否 | 防盗链域名白名单（逗号分隔） | `""`（关闭） |
| `CACHE_TTL_SECONDS` | number | 否 | 缓存过期时间（秒） | `604800`（7 天） |
| `ENABLE_SIGNATURE` | boolean | 否 | 是否启用全局签名保护 | `false` |
| `RATE_LIMIT_PER_MIN` | number | 否 | 每分钟每 IP 请求限制 | `120` |
| `EMERGENCY_LOCKDOWN` | boolean | 否 | 紧急熔断开关 | `false` |

### Secrets 配置

| Secret 名 | 必填 | 说明 | 生成方式 |
|-----------|------|------|----------|
| `GITHUB_TOKEN` | 是 | GitHub PAT（需 `Contents: Read and write` 权限） | GitHub Settings → Developer settings → Personal access tokens |
| `SIGN_SECRET` | 否 | HMAC 签名密钥（启用签名时需要） | 随机生成（建议 `openssl rand -hex 32`） |

---

## 开发与测试

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动本地开发服务器（支持热重载）
pnpm dev
```

开发服务器将在 `http://localhost:8787` 启动。

### 运行测试

```bash
pnpm test
```

使用 Vitest 运行单元测试，基于 `@cloudflare/vitest-pool-workers` 模拟 Cloudflare Workers 运行时环境。

### 类型检查

```bash
pnpm typecheck
```

使用 TypeScript 编译器进行类型检查。

---

## 部署

### 手动部署

```bash
pnpm deploy
```

将 Worker 部署到 Cloudflare 生产环境（默认名称 `picbed-cf-github`）。

### 自动部署（CI/CD）

项目已配置 GitHub Actions 自动部署：

| 触发条件 | 部署环境 |
|----------|----------|
| 推送到 `main` 分支 | 生产环境 |
| 创建 Pull Request | 预览环境 |

**需要的 GitHub Secrets**：

| Secret 名 | 说明 |
|-----------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

**配置步骤**：

1. 在 Cloudflare Dashboard 获取 API Token：`Workers & Pages` → `API Tokens` → `Create Token`
2. 在 GitHub 仓库 Settings → Secrets → Actions 中添加上述 Secrets

---

## 常见问题

### Q: 上传图片后返回 404

**A**: 检查以下几点：
1. GitHub 仓库是否设置为私有
2. `GITHUB_TOKEN` 是否包含 `Contents: Read and write` 权限
3. `GITHUB_USER` 和 `GITHUB_REPO` 是否正确

### Q: 图片无法缩放

**A**: Cloudflare Image Resizing 功能需要：
1. 在 Cloudflare Dashboard 中启用 Image Resizing 功能（部分套餐需要订阅）
2. Worker 会自动降级返回原始图片，不影响正常访问

### Q: 防盗链不生效

**A**: 检查 `ALLOWED_REFERERS` 配置格式：
- 多个域名用逗号分隔
- 域名不包含协议（`http://` 或 `https://`）
- 支持通配符：`*.example.com`

### Q: 签名链接过期

**A**: 签名有效期由 `exp` 参数控制，生成时指定合适的秒数。如时间不同步，检查服务器时钟是否准确。

### Q: GitHub API 调用受限

**A**: GitHub API 有速率限制：
- 未认证：每小时 60 次
- 已认证：每小时 5000 次

确保 `GITHUB_TOKEN` 正确配置。Cloudflare 边缘缓存可显著减少对 GitHub API 的直接调用。

### Q: 如何配置紧急熔断？

**A**: 设置环境变量 `EMERGENCY_LOCKDOWN = "true"` 并重新部署即可。启用后所有请求都需要携带 `?sig=...&exp=...` 参数。

---

## 开源协议

MIT
