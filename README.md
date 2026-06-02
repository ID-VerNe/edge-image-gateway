# Edge Image Gateway

> 基于 **Cloudflare Workers + Hono + GitHub 私有仓库** 构建的生产级私有图片托管服务。

![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Hono](https://img.shields.io/badge/Hono-4.x-orange)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-Latest-yellow)
![Vitest](https://img.shields.io/badge/Vitest-4.x-green)
![pnpm](https://img.shields.io/badge/pnpm-10.x-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 目录

- [简介](#简介)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [文档](#文档)
- [开源协议](#开源协议)

---

## 简介

Edge Image Gateway 是一款运行于 Cloudflare Workers 边缘网络的私有图片托管和 CDN 服务。它将图片存储在私有 GitHub 仓库中，并通过 Edge Workers 提供安全、高速的访问。非常适合个人博客、Markdown 笔记和社交媒体分享。

**核心优势**：

- **零基础设施成本**：利用 Cloudflare Workers 免费套餐和 GitHub 免费私有仓库，无需管理后端服务器。
- **全球加速**：依托 Cloudflare 边缘缓存实现全球高速加载。
- **安全私密**：图片存储在私有仓库中，具备七层纵深安全防护体系。
- **功能丰富**：支持动态图片缩放、多仓库扩展、高保真管理后台和防盗链。

---

## 核心功能

### 存储层

- **GitHub 私有存储**：使用私有 GitHub 仓库实现安全可靠的存储。
- **多仓库扩展**：通过 KV 注册多个仓库，突破单仓库限制并实现动态路由。
- **直接原始输出**：通过 GitHub Contents API 直接流式传输文件内容。
- **多格式支持**：支持常见图片格式（PNG、JPEG、WebP、AVIF、GIF、SVG）以及视频（MP4、WebM）和静态文件。

### 边缘处理

- **动态图片缩放**：通过 URL 参数在边缘实时调整图片大小和质量。
- **自动格式协商**：Cloudflare Image Resizing 根据客户端能力自动选择 WebP/AVIF 格式。
- **回环代理架构**：自定义"回环"模式，解决 Cloudflare 缩放引擎无法直接获取私有 GitHub 仓库内容的问题。
- **智能降级**：缩放失败时自动回退到原始图片。

### 多层安全模型

| 安全层 | 类型 | 说明 |
|------|------|------|
| 防盗链 | 应用层 | 基于 Referer/Origin 头部的域名白名单，配合 `Sec-Fetch-Dest` 验证 |
| HMAC 签名 | 应用层 | 基于 HMAC-SHA256 的限时签名链接，实现安全的临时分享 |
| 速率限制 | 应用层 | 基于 IP 的请求限制，配合 404 惩罚机制进行封禁 |
| 分级访问 | 应用层 | 敏感路径（`/private/`、`/draft/`、`/raw/`）强制要求签名 |
| 紧急锁定 | 应用层 | 一键全局签名强制启用，提供最大程度保护 |
| 数据脱敏 | 应用层 | 从响应中剥离后端标识信息（`X-GitHub-*`、`Server` 等） |
| 路径安全 | 应用层 | 防止路径遍历攻击（`..`） |

### 管理后台

- **文件管理**：高保真文件浏览器，支持列表/网格视图切换。
- **无缝上传**：拖拽上传，自动 SHA-256 去重。
- **文件操作**：删除、移动文件，通过 `.gitkeep` 文件模拟创建文件夹。
- **仓库管理**：多仓库注册、状态监控、写入目标切换。
- **统计仪表盘**：实时查看仓库数量、文件总数和存储用量。
- **缓存控制**：边缘缓存手动清理接口。

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Hono (v4) — 轻量级边缘 Web 框架 |
| 运行时 | Cloudflare Workers — 边缘计算平台 |
| 存储后端 | GitHub 私有仓库 + GitHub Contents API |
| 图片处理 | Cloudflare Image Resizing 边缘缩放 |
| 缓存 | Cloudflare Cache API |
| 状态管理 | Cloudflare KV（多仓库注册信息） |
| 认证 | Cloudflare Access（管理后台） |
| 开发语言 | TypeScript 6.x |
| 测试 | Vitest 4.x + @cloudflare/vitest-pool-workers |
| 构建部署 | Wrangler CLI + GitHub Actions CI/CD |
| 包管理 | pnpm 10.x |

---

## 项目结构

```
edge-image-gateway/
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions CI/CD 部署工作流
├── docs/                   # 详细文档目录
│   ├── architecture.md     # 技术架构详解
│   ├── configuration.md    # 配置参考
│   ├── security.md         # 安全配置指南
│   ├── admin-panel.md      # 管理后台指南
│   ├── multi-repo.md       # 多仓库路由配置
│   ├── api-reference.md    # API 参考文档
│   ├── development.md      # 开发与测试指南
│   └── deployment.md       # 部署指南
├── scripts/
│   └── sign.ts             # HMAC 签名生成脚本
├── src/                    # 源代码
│   ├── index.ts            # 应用入口，路由注册
│   ├── middleware/          # 中间件（限流/签名/防盗链/认证）
│   ├── routes/             # 路由处理（图片/管理后台/API）
│   ├── services/           # 业务服务（GitHub API/路由/定时任务）
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数（签名/哈希/MIME/日志）
├── tests/                  # 测试文件
├── USAGE.md                # 使用指南（前端集成示例）
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wrangler.toml.example   # Wrangler 配置模板
```

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 包管理器
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（随 pnpm 安装）
- Cloudflare 账户
- GitHub 账户

### 第一步：GitHub 配置

1. 创建一个**私有**仓库（例如 `image-storage`）。
2. 生成一个**细粒度个人访问令牌（PAT）**：
   - 权限范围：`Contents` — `读取和写入`
   - 访问权限：仅限特定的存储仓库。

### 第二步：安装依赖

```bash
pnpm install
```

### 第三步：配置

复制模板文件并编辑 `wrangler.toml`：

```bash
cp wrangler.toml.example wrangler.toml
```

### 第四步：设置密钥

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

### 第五步：测试与部署

```bash
pnpm dev        # 本地开发，默认 http://localhost:8787
pnpm test       # 运行测试
pnpm typecheck  # TypeScript 类型检查
pnpm deploy     # 部署到 Cloudflare Workers
```

---

## 文档

详细文档请参阅 [`docs/`](./docs) 目录：

| 文档 | 说明 |
|------|------|
| [架构详解](./docs/architecture.md) | 技术架构、请求流程、回环代理原理 |
| [配置参考](./docs/configuration.md) | 环境变量、Secrets、KV 命名空间配置 |
| [安全指南](./docs/security.md) | 防盗链、签名验证、限流、熔断等多层安全配置 |
| [管理后台](./docs/admin-panel.md) | 后台功能、操作指南、前端说明 |
| [多仓库路由](./docs/multi-repo.md) | 多仓库注册、路由规则、状态管理 |
| [API 参考](./docs/api-reference.md) | 所有 API 端点、请求/响应格式 |
| [开发与测试](./docs/development.md) | 本地开发、测试、类型检查 |
| [部署指南](./docs/deployment.md) | 手动部署、CI/CD 配置、环境管理 |

另有 [USAGE.md](./USAGE.md) 提供前端集成的具体代码示例。

---

## 开源协议

MIT