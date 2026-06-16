# Edge Image Gateway

> 基于 Cloudflare Workers + GitHub 构建的边缘图片网关，具备图片托管、实时处理、多仓库管理、访问控制及管理面板等企业级功能。

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/framework-Hono-3600ff?style=flat-square" alt="Hono">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/status-production--ready-brightgreen?style=flat-square" alt="Production Ready">
  <br>
  <img src="https://img.shields.io/badge/database-D1-f4a261?style=flat-square&logo=cloudflare" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/cache-KV%20%7C%20R2-f38020?style=flat-square&logo=cloudflare" alt="KV + R2">
  <img src="https://img.shields.io/badge/test-Vitest-6e9f18?style=flat-square&logo=vitest" alt="Vitest">
  <img src="https://img.shields.io/badge/package-pnpm-f69220?style=flat-square&logo=pnpm" alt="pnpm">
</p>

---

## 为什么选择 Edge Image Gateway？

| 痛点 | 传统方案 | Edge Image Gateway |
|------|----------|-------------------|
| **存储成本** | 云对象存储按月付费，流量费高昂 | 利用 GitHub 免费私有仓库，零额外存储成本 |
| **图片处理** | 需预生成多尺寸缩略图，存储冗余 | 边缘实时处理，按需缩放/裁剪/转格式 |
| **访问速度** | 单地域服务器，跨区域延迟高 | Cloudflare 全球边缘网络，就近响应 |
| **安全防护** | 需额外配置 WAF、CDN、鉴权服务 | 内置多层防护：限流、防盗链、HMAC 签名、熔断 |
| **运维复杂度** | 数据库 + 对象存储 + CDN + 图片处理服务 | 一个 Worker 搞定全部，Serverless 免运维 |
| **多站点管理** | 每个站点单独配置，管理碎片化 | 多仓库路由 + 路径前缀匹配，统一管理面板 |

---

## 目录

- [特性一览](#特性一览)
- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [配置](#配置)
- [API 总览](#api-总览)
- [管理面板](#管理面板)
- [安全](#安全)
- [CI/CD](#cicd)
- [技术栈](#技术栈)
- [文档目录](#文档目录)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [License](#license)

---

## 特性一览

| 类别 | 特性 | 说明 |
|------|------|------|
| **存储** | GitHub 后端存储 | 利用 GitHub 仓库存储图片，无需额外存储服务 |
| **存储** | D1 主索引 | 使用 Cloudflare D1 (SQLite) 作为唯一主索引，KV 仅用于限流与监控 |
| **存储** | 多仓库支持 & 迁移 | 支持多 GitHub 仓库，提供 Draining 状态与可视化跨仓库文件自动迁移工具 |
| **图片处理** | 实时处理 | 基于 Cloudflare Image Resizing 实现缩放、裁剪、格式转换、锐化等 |
| **访问控制** | 多层防护 | Referer 防盗链、HMAC 签名认证、IP 令牌桶限流、紧急熔断开关 |
| **访问控制** | 细粒度 API 令牌 | 生成带有效期的 API 访问令牌，支持作用域 (读/写/删) 和路径前缀限制 |
| **管理** | Web 管理面板 | 内置管理界面，支持文件浏览、上传、批量操作、仓库管理、审计日志 |
| **管理** | 双因素认证 | 支持 Cloudflare Access (Zero Trust) 保护管理面板 (TOTP 规划中) |
| **缓存** | 四级缓存架构 | L1 Workers + L2 R2 变体缓存 + L3 Browser + L4 In-Memory |
| **分享** | 临时分享链接 | 生成带 HMAC 签名和过期时间的分享 URL，可绕过防盗链检查 |
| **可观测性** | 监控告警 | 结构化日志、Analytics Engine 指标、Telegram 实时告警、GitHub Rate Limit 监控 |
| **可观测性** | 审计日志 | 记录所有上传、删除、配置变更等敏感操作，支持追溯 |
| **自动化** | 定时任务 | 通过 Cron Trigger 自动同步仓库容量统计，恢复暂停的迁移任务 |
| **自动化** | 启动自检 | 基于 Zod 的环境变量强制自检，配置防呆，避免线上生产环境漏配 |

---

## 架构概览

```
                    ┌──────────────────────┐
                    │   客户端 / 浏览器     │
                    └─────────┬────────────┘
                              │
                    ┌─────────▼────────────┐
                    │   Cloudflare Workers  │
                    │   (Edge Image Gateway)│
                    │                      │
                    │  ┌─── 中间件链 ──────┐│
                    │  │ 1. 速率限制       ││
                    │  │ 2. 防盗链         ││
                    │  │ 3. 签名认证 + 熔断 ││
                    │  │ 4. 管理认证       ││
                    │  └───────────────────┘│
                    │  ┌─── 路由处理 ──────┐│
                    │  │ • 图片请求分发     ││
                    │  │ • 实时 Resize      ││
                    │  │ • 四级缓存控制     ││
                    │  │ • 管理面板 API     ││
                    │  └───────────────────┘│
                    └─────────┬────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
  ┌───────▼───────┐   ┌──────▼──────┐   ┌───────▼───────┐
  │  GitHub Repo 1 │   │ GitHub Repo 2│   │ GitHub Repo N│
  │  (active)      │   │ (readonly)   │   │ (draining)    │
  └───────────────┘   └─────────────┘   └───────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │  持久化与性能增强层   │
                    │ • D1 (主索引/配置)    │
                    │ • KV (限流/监控)      │
                    │ • R2 (图片变体缓存)   │
                    │ • Analytics Engine   │
                    └──────────────────────┘
```

详细架构说明见 [docs/architecture/overview.md](docs/architecture/overview.md)（全景图）和 [docs/architecture/details.md](docs/architecture/details.md)（模块详解）。

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9（强制使用 pnpm，`package.json` 中已配置 `packageManager`）
- [Cloudflare 账号](https://dash.cloudflare.com/)（需 D1, R2, KV, Workers 权限）
- 一个 [GitHub](https://github.com) 仓库（用于存储图片）
- GitHub Personal Access Token（需 `Contents` 读写权限，建议 Fine-grained）

### 本地开发

```bash
# 克隆仓库
git clone <repo-url>
cd edge-image-gateway

# 安装依赖（pnpm 会自动识别 packageManager 版本）
pnpm install

# 复制环境配置
copy wrangler.toml.example wrangler.toml

# 编辑 wrangler.toml，填入你的环境变量及 D1/R2/KV 绑定
# 详见 docs/deployment/configuration.md

# 初始化 D1 数据库
pnpm exec wrangler d1 execute <DB_ID> --file=./scripts/schema.sql

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 本地启动开发服务器
pnpm dev
```

开发服务器默认运行在 `http://localhost:8787`。

> **注意：** 本地开发时 GitHub API 调用是真实的，图片处理（Image Resizing）功能在本地不可用，需部署后测试。

### 可用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动本地开发服务器（热更新） |
| `pnpm test` | 运行所有测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm deploy` | 部署到 Cloudflare Workers |

### 一键部署

```bash
# 部署到 Cloudflare Workers（生产环境）
pnpm exec wrangler deploy --env production
```

详细部署指南见 [docs/deployment/deployment.md](docs/deployment/deployment.md)。

---

## 项目结构

```
edge-image-gateway/
├── src/
│   ├── index.ts                  # 应用入口，中间件注册、路由挂载、Cron 触发
│   ├── routes/
│   │   ├── image.ts              # 图片处理路由（获取、上传、删除、列表、分享）
│   │   ├── admin.ts              # 管理面板路由聚合（HTML 页面 + API 路由）
│   │   └── admin/
│   │       ├── api/              # 管理 API 端点
│   │       │   ├── files.ts      # 文件管理
│   │       │   ├── repos.ts      # 仓库管理 (含迁移端点)
│   │       │   ├── stats.ts      # 统计查询与 Token 管理
│   │       │   ├── audit.ts      # 审计日志
│   │       │   ├── upload.ts     # 管理面板上传 (含去重逻辑)
│   │       │   └── files/
│   │       │       ├── mutate.ts # 文件修改（删除/移动/异步迁移运行器）
│   │       │       ├── query.ts  # 文件查询
│   │       │       └── share.ts  # 分享链接管理
│   │       └── scripts/          # 前端 JavaScript 模块
│   ├── middleware/
│   │   ├── rateLimit.ts          # 令牌桶速率限制 (支持 404 封禁)
│   │   ├── referer.ts            # Referer 防盗链
│   │   ├── signature.ts          # HMAC 签名认证 + 紧急熔断
│   │   └── adminAuth.ts          # 管理员认证 (Access / Token)
│   ├── services/
│   │   ├── github.ts             # GitHub API 封装
│   │   ├── repoRouter.ts         # 多仓库路由引擎 (支持 D1/KV 双读)
│   │   ├── cron.ts               # 定时任务 (容量同步、迁移恢复)
│   │   ├── database.ts           # D1/KV 数据访问层 (一致性封装)
│   │   └── repoMigration.ts      # 跨仓库迁移引擎
│   ├── utils/
│   │   ├── configCheck.ts        # 启动自检 (Zod Schema)
│   │   ├── logger.ts             # 结构化日志
│   │   ├── notifications.ts      # Telegram 告警通知
│   │   ├── cache.ts              # 缓存管理
│   │   ├── r2Cache.ts            # R2 缓存集成 (L2 Cache)
│   │   └── ...
├── scripts/
│   ├── sign.ts                   # 签名生成工具
│   └── schema.sql                # D1 数据库 Schema
├── tests/
│   ├── index.spec.ts             # 集成测试
│   └── unit/                     # 单元测试 (限流、签名、自检、一致性)
├── docs/                         # 详尽文档 (事故手册、演练报告等)
├── wrangler.toml.example         # 配置模板 (含 D1/R2/AE 绑定)
└── ...
```

---

## 配置

核心配置项：

| 变量 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `ENVIRONMENT` | 否 | 明文 | 运行环境 (`production` 或 `development`) |
| `GITHUB_USER` | 是 | 明文 | GitHub 用户名或组织名 |
| `GITHUB_REPO` | 是 | 明文 | 默认 GitHub 仓库名 |
| `GITHUB_BRANCH` | 否 | 明文 | GitHub 仓库分支，默认 `main` |
| `GITHUB_TOKEN` | 是 | Secret | GitHub Personal Access Token（需 `repo` 权限） |
| `SIGN_SECRET` | 是 | Secret | HMAC 签名密钥 (长度需 >= 16) |
| `ADMIN_EMAILS` | 否 | 明文 | 管理员邮箱白名单 (Cloudflare Access 认证) |
| `EMERGENCY_LOCKDOWN` | 否 | 明文 | 紧急熔断开关，设为 `"true"` 拒绝所有写操作 |
| `RATE_LIMIT_PER_MIN` | 否 | 明文 | 每分钟每 IP 最大请求数，默认 `120` |
| `ENABLE_SIGNATURE` | 否 | 明文 | 全局强制签名模式，设为 `"true"` 所有非可信请求需签名 |
| `ALLOWED_REFERERS` | 否 | 明文 | 防盗链 Referer 白名单，逗号分隔 |
| `APP_TITLE` | 否 | 明文 | 首页展示标题，默认 `Edge Image Gateway` |
| `APP_DESCRIPTION` | 否 | 明文 | 首页展示描述 |

完整配置说明见 [docs/deployment/configuration.md](docs/deployment/configuration.md)。

---

## API 总览

详细 API 文档见 [docs/features/api-reference.md](docs/features/api-reference.md)。

---

## 管理面板

系统内置完整的 SPA 管理后台，访问 `https://{你的域名}/admin` 即可使用。功能包括：

- **文件管理** — 浏览、上传、删除、移动、搜索
- **仓库管理** — 注册、状态管理、容量监控、迁移
- **Token 管理** — 创建/吊销 API 令牌
- **审计日志** — 查看所有管理操作记录
- **缓存清除** — 全局或按文件清除边缘缓存

详细说明见 [docs/features/admin-panel.md](docs/features/admin-panel.md)。

---

## 安全

Edge Image Gateway 采用深度防御策略，多层安全防护：

```
请求入口 → 速率限制 → 防盗链 → 签名认证+熔断 → 管理认证 → 响应清洗
```

| 层级 | 机制 | 说明 |
|------|------|------|
| L1 | IP 速率限制 + 404 封禁 | 令牌桶限流，恶意扫描自动封禁 |
| L2 | Referer 防盗链 | 白名单域名校验，智能区分浏览器与工具 |
| L3 | HMAC 签名 + 紧急熔断 | 写操作签名验证，一键熔断拒绝所有写入 |
| L4 | 管理认证 | API Token / Cloudflare Access / TOTP 双因素 |
| L5 | 响应安全头 | 清洗敏感头，添加 CSP / nosniff / DENY 等 |

详细安全文档见 [docs/security/security.md](docs/security/security.md)。

---

## CI/CD

项目内置了 GitHub Actions 工作流（[deploy.yml](.github/workflows/deploy.yml)），支持自动部署：

| 触发条件 | 行为 |
|----------|------|
| 推送到 `master` 分支 | 自动部署到生产环境 (`--env production`) |
| 创建 Pull Request | 自动部署到预览环境 (`--env preview`) |

**所需 GitHub Secrets：**

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需 Workers 部署权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

**工作流流程：**

1. 检出代码并安装 pnpm
2. 安装依赖（使用 pnpm lockfile 缓存）
3. （可选）运行测试和类型检查
4. 根据分支自动选择环境 (`production` / `preview`)
5. 执行 `wrangler deploy` 部署

> 提示：如需在 CI 中运行测试，可取消 `deploy.yml` 中测试步骤的注释。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| [Cloudflare Workers](https://workers.cloudflare.com/) | 无服务器边缘计算平台 |
| [Cloudflare D1](https://developers.cloudflare.com/d1/) | 关系型数据库 (SQLite) - 主索引 |
| [Cloudflare KV](https://developers.cloudflare.com/kv/) | 键值存储 - 限流与监控 |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | 对象存储 - 图片变体缓存 (L2) |
| [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) | 时序指标监控 |
| [Hono](https://hono.dev/) | 轻量级 Web 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全的开发语言 |
| [Cloudflare Image Resizing](https://developers.cloudflare.com/images/image-resizing/) | 实时图片处理 |
| [Zod](https://zod.dev/) | 运行时数据校验与自检 |
| [Vitest](https://vitest.dev/) | 单元测试框架 |

---

## 文档目录

| 文档 | 说明 |
|------|------|
| [文档导航](docs/index.md) | 文档索引与快速导航 |
| [使用指南](USAGE.md) | 日常使用、文件管理、签名生成、图片处理 |
| [架构总览](docs/architecture/overview.md) | 系统架构全景图、请求生命周期、缓存体系 |
| [架构说明](docs/architecture/details.md) | 模块架构、请求流程、数据流、KV 键设计 |
| [管理面板](docs/features/admin-panel.md) | 管理面板功能、认证方式、前端技术实现 |
| [配置说明](docs/deployment/configuration.md) | 环境变量、KV 动态配置、多环境部署 |
| [部署指南](docs/deployment/deployment.md) | 从零部署到 Cloudflare Workers 的完整步骤 |
| [API 参考](docs/features/api-reference.md) | 所有 API 端点详细说明 |
| [安全指南](docs/security/security.md) | 安全机制、认证鉴权、最佳实践 |
| [多仓库管理](docs/features/multi-repo.md) | 多仓库路由、容量管理、仓库迁移 |
| [开发指南](docs/development/development.md) | 本地开发、项目结构、测试与调试 |
| [接入指南](docs/integration/index.md) | 第三方应用集成：Python / TypeScript / PHP |
| [事故手册](docs/security/runbook.md) | 事故响应流程与紧急处置指南 |

---

## 常见问题

<details>
<summary><strong>支持哪些图片格式？</strong></summary>

默认支持 `image/png`、`image/jpeg`、`image/webp`、`image/avif`、`image/gif`、`image/svg+xml`。可通过 KV 配置 `allowed_types` 扩展。
</details>

<details>
<summary><strong>单文件大小限制是多少？</strong></summary>

默认 25MB。可通过 KV 配置 `max_file_size` 调整（需在 GitHub API 限制范围内）。
</details>

<details>
<summary><strong>图片处理功能需要额外付费吗？</strong></summary>

是的，Cloudflare Image Resizing 需要 Pro / Business / Enterprise 订阅或单独的 Images 订阅。不启用图片处理参数时，图片作为原始文件直接返回，不产生额外费用。
</details>

<details>
<summary><strong>GitHub 仓库设为 Private 安全吗？</strong></summary>

安全。Worker 通过 GitHub Token 认证访问私有仓库，图片不会直接暴露给公网。所有访问都经过 Worker 的安全中间件过滤。
</details>

<details>
<summary><strong>如何迁移到新仓库？</strong></summary>

使用管理面板的仓库迁移功能，或手动通过 `git clone` 迁移。详见 [多仓库管理](docs/features/multi-repo.md#仓库迁移)。
</details>

<details>
<summary><strong>遇到 GitHub API 限流怎么办？</strong></summary>

1. 增加缓存 TTL 减少 API 调用
2. 确保 R2 缓存 (L2) 正常工作
3. 使用多仓库分担 API 配额
4. 参考 [事故手册](docs/security/runbook.md#场景-5-github-rate-limit-耗尽)
</details>

---

## 贡献指南

1. Fork 项目并创建功能分支
2. 确保现有测试通过：`pnpm test && pnpm typecheck`
3. 为新功能添加测试
4. 提交 PR 并附上详细说明

更多细节见 [docs/development/development.md](docs/development/development.md)。

---

## License

[MIT](LICENSE)