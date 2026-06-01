# Picbed CF GitHub

> 基于 **Cloudflare Workers + Hono + GitHub 私有仓库** 构建的生产级私有图床服务

![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Hono](https://img.shields.io/badge/Hono-4.x-orange)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-Latest-yellow)
![Vitest](https://img.shields.io/badge/Vitest-4.x-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 项目简介

Picbed CF GitHub 是一个运行在 Cloudflare Workers 边缘网络上的私有图床服务。它将图片存储在 GitHub 私有仓库中，通过 Edge Worker 对外提供安全、快速的图片访问服务。适用于个人博客、Markdown 笔记、社交媒体分享等场景。

**主要优势**：

- **零服务器成本**：利用 Cloudflare Workers 免费额度和 GitHub 免费私有仓库，无需托管任何后端服务器。
- **全球加速**：通过 Cloudflare 边缘缓存，图片在全球范围内高速加载。
- **安全可控**：图片存储在私有仓库中，对外访问受多层安全策略保护。
- **丰富特性**：动态图片缩放、多仓库支持、管理后台、防盗链、签名分享等。

---

## 核心特性

### 存储层

- **GitHub 私有仓库存储**：图片源文件存放在 GitHub 私有仓库中，安全可靠。
- **多仓库支持**：通过 KV 存储注册多个 GitHub 仓库，支持按路径前缀路由读取，支持多写仓库切换。
- **原始文件直出**：通过 GitHub Contents API 以流式方式获取原始文件内容。
- **多类型支持**：不仅支持常见图片格式（PNG、JPEG、WebP、AVIF、GIF、SVG），也可托管视频（MP4、WebM）及其他静态文件。

### 边缘处理

- **动态图片缩放**：支持通过 URL 查询参数在边缘节点实时调整图片尺寸、质量。
- **自动格式协商**：Cloudflare Image Resizing 自动根据客户端能力选择 WebP/AVIF 等现代格式。
- **回环代理模式**：独创的"回环代理"架构，完美解决 Cloudflare 缩放引擎无法直接抓取 GitHub 私有仓库内容的问题。当需要缩放时，Worker 构造带内部签名的请求回调自身，缩放引擎在 Worker 内部完成图片获取与缩放。
- **智能降级**：缩放失败时自动回退到原始图片，保证服务不中断。

### 混合防御安全模型

| 防线 | 层级 | 说明 |
|------|------|------|
| 防盗链 | 应用层 | 基于 Referer/Origin 请求头的域名白名单，配合 `Sec-Fetch-Dest` 校验 |
| HMAC 签名 | 应用层 | 对图片提供带有效期的 HMAC-SHA256 签名链接，实现临时安全分享 |
| 限流保护 | 应用层 | 基于 `CF-Connecting-IP` 的请求频率限制，含 404 惩罚封禁机制 |
| 目录分级 | 应用层 | 敏感路径（`/private/`、`/draft/`、`/raw/`）强制签名 |
| 紧急熔断 | 应用层 | 全站签名强制开关，一键启用最高防护等级 |
| 响应脱敏 | 应用层 | 自动剥离后端标识响应头，隐藏架构信息 |
| 路径安全 | 应用层 | 禁止路径穿越攻击（`..`） |

### 管理后台

- **文件管理**：图形化文件浏览器，支持列表/网格视图切换
- **文件上传**：支持拖拽上传和点选上传，自动去重检测
- **文件操作**：删除、移动、新建文件夹
- **仓库管理**：多仓库注册、状态切换、写仓库切换
- **统计面板**：仓库数、文件数、存储用量概览
- **缓存管理**：一键刷新边缘缓存

### 运维特性

- **Cloudflare 边缘缓存**：利用 Cache API 缓存已请求的图片，减少 GitHub API 调用。
- **结构化日志**：JSON 格式的结构化日志输出，便于检索和分析。
- **GitHub Actions CI/CD**：主分支推送自动部署到生产环境，PR 自动部署预览环境。
- **定时任务**：自动同步所有注册仓库的容量信息。
- **健康检查端点**：`/healthz` 提供环境配置状态检查。

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 包管理器
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（Cloudflare Workers 命令行工具）
- Cloudflare 账户（免费版即可）
- GitHub 账户

### 第一步：GitHub 准备

1. 创建一个 **私有 (Private)** 仓库用于存放图片（例如 `picbed-storage`）。
2. 生成一个 **Fine-grained Personal Access Token (PAT)**：
   - 访问 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - 设置权限：`Contents` - `Read and write`
   - Repository access：仅限上述存储仓库

### 第二步：安装依赖

```bash
pnpm install
```

### 第三步：配置项目

复制配置文件模板并编辑：

```bash
cp wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，参考 [配置文档](./docs/configuration.md) 设置各项参数。

### 第四步：设置 Secrets

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

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

---

## 开源协议

MIT
