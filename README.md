# Edge Image Gateway

> A production-grade private image hosting service built on **Cloudflare Workers + Hono + GitHub Private Repositories**.

![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Hono](https://img.shields.io/badge/Hono-4.x-orange)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-Latest-yellow)
![Vitest](https://img.shields.io/badge/Vitest-4.x-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## Introduction

Edge Image Gateway is a private image hosting and CDN service running on the Cloudflare Workers edge network. It stores images in private GitHub repositories and provides secure, high-speed access through Edge Workers. Ideal for personal blogs, Markdown notes, and social media sharing.

**Key Advantages**:

- **Zero Infrastructure Cost**: Leverage Cloudflare Workers' free tier and GitHub's free private repositories with no backend server to manage.
- **Global Acceleration**: High-speed loading worldwide via Cloudflare edge caching.
- **Secure & Private**: Images are stored in private repos with multi-layered security (HMAC signatures, Referer protection).
- **Rich Feature Set**: Dynamic image resizing, multi-repo scaling, high-fidelity admin panel, and anti-hotlinking.

---

## Core Features

### Storage Layer

- **GitHub Private Storage**: Secure and reliable storage using private GitHub repositories.
- **Multi-Repo Scaling**: Register multiple repositories via KV to bypass single-repo limits and enable dynamic routing.
- **Direct Raw Output**: Stream file content directly via GitHub Contents API.
- **Multi-Format Support**: Supports common image formats (PNG, JPEG, WebP, AVIF, GIF, SVG) as well as videos (MP4, WebM) and static files.

### Edge Processing

- **Dynamic Image Resizing**: Real-time resizing and quality adjustment at the edge via URL parameters.
- **Auto Format Negotiation**: Cloudflare Image Resizing automatically selects WebP/AVIF based on client capability.
- **Loopback Proxy Architecture**: A custom "Loopback" pattern that solves the issue of Cloudflare's resizing engine being unable to directly fetch from private GitHub repos.
- **Smart Fallback**: Automatically falls back to original images if resizing fails.

### Multi-Layer Security Model

| Layer | Type | Description |
|------|------|------|
| Anti-Hotlinking | App | Domain whitelist based on Referer/Origin headers with `Sec-Fetch-Dest` validation. |
| HMAC Signature | App | Time-limited HMAC-SHA256 signed links for secure temporary sharing. |
| Rate Limiting | App | IP-based request limits with 404 penalty-based blocking. |
| Tiered Access | App | Mandatory signatures for sensitive paths (`/private/`, `/draft/`, `/raw/`). |
| Emergency Lockdown | App | One-click global signature enforcement for maximum protection. |
| Data De-identification | App | Strips backend identifiers (`X-GitHub-*`, `Server`, etc.) from responses. |
| Path Security | App | Prevents path traversal attacks (`..`). |

### Admin Panel

- **File Management**: High-fidelity file browser with List/Grid view toggles.
- **Seamless Uploads**: Drag-and-drop support with automatic SHA-256 deduplication.
- **File Operations**: Delete, move, and create folders simulated via `.keep` files.
- **Repo Management**: Multi-repo registration, status monitoring, and write-target switching.
- **Statistics Dashboard**: Real-time overview of repo counts, file totals, and storage usage.
- **Cache Control**: Manual purge interface for edge cache.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) package manager
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare Account
- GitHub Account

### Step 1: GitHub Setup

1. Create a **Private** repository (e.g., `image-storage`).
2. Generate a **Fine-grained Personal Access Token (PAT)**:
   - Scope: `Contents` - `Read and write`
   - Access: Only the specific storage repository.

### Step 2: Install

```bash
pnpm install
```

### Step 3: Configure

Copy the template and edit `wrangler.toml`:

```bash
cp wrangler.toml.example wrangler.toml
```

### Step 4: Set Secrets

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

### Step 5: Test & Deploy

```bash
pnpm dev
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
