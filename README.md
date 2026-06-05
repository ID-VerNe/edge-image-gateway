# Edge Image Gateway

> 基于 Cloudflare Workers + GitHub 构建的边缘图片网关，具备图片托管、实时处理、多仓库管理、访问控制及管理面板等企业级功能。

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/framework-Hono-3600ff?style=flat-square" alt="Hono">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
</p>

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
- [技术栈](#技术栈)
- [文档目录](#文档目录)
- [贡献指南](#贡献指南)
- [License](#license)

---

## 特性一览

| 类别 | 特性 | 说明 |
|------|------|------|
| **存储** | GitHub 后端存储 | 利用 GitHub 仓库存储图片，无需额外存储服务 |
| **存储** | D1 主索引 | 使用 Cloudflare D1 (SQLite) 作为高性能主索引，并同步 KV 镜像实现平滑降级 |
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
                    │ • KV (降级镜像/限流)  │
                    │ • R2 (图片变体缓存)   │
                    │ • Analytics Engine   │
                    └──────────────────────┘
```

详细架构说明见 [docs/architecture.md](docs/architecture.md) 及 [docs/architecture-overview.md](docs/architecture-overview.md)。

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9 (强制使用 pnpm)
- [Cloudflare 账号](https://dash.cloudflare.com/) (需 D1, R2, KV, Workers 权限)
- 一个 [GitHub](https://github.com) 仓库（用于存储图片）

### 本地开发

```bash
# 克隆仓库
git clone <repo-url>
cd edge-image-gateway

# 安装依赖
pnpm install

# 复制环境配置
copy wrangler.toml.example wrangler.toml

# 编辑 wrangler.toml，填入你的环境变量及 D1/R2/KV 绑定
# 详见 docs/configuration.md

# 初始化 D1 数据库
pnpm exec wrangler d1 execute <DB_ID> --file=./scripts/schema.sql

# 运行测试
pnpm test

# 本地启动开发服务器
pnpm dev
```

开发服务器默认运行在 `http://localhost:8787`。

### 一键部署

```bash
# 部署到 Cloudflare Workers (生产环境)
pnpm exec wrangler deploy --env production
```

详细部署指南见 [docs/deployment.md](docs/deployment.md)。

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
| `GITHUB_TOKEN` | 是 | Secret | GitHub Personal Access Token（需 `repo` 权限） |
| `SIGN_SECRET` | 是 | Secret | HMAC 签名密钥 (长度需 >= 16) |
| `ADMIN_EMAILS` | 否 | 明文 | 管理员邮箱白名单 (Cloudflare Access 认证) |
| `EMERGENCY_LOCKDOWN` | 否 | 明文 | 紧急熔断开关，设为 `"true"` 拒绝所有写操作 |
| `RATE_LIMIT_PER_MIN` | 否 | 明文 | 每分钟每 IP 最大请求数，默认 `120` |

完整配置说明见 [docs/configuration.md](docs/configuration.md)。

---

## API 总览

详细 API 文档见 [docs/api-reference.md](docs/api-reference.md)。

---

## 安全

详细安全文档见 [docs/security.md](docs/security.md)。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| [Cloudflare Workers](https://workers.cloudflare.com/) | 无服务器边缘计算平台 |
| [Cloudflare D1](https://developers.cloudflare.com/d1/) | 关系型数据库 (SQLite) - 主索引 |
| [Cloudflare KV](https://developers.cloudflare.com/kv/) | 键值存储 - 降级镜像与限流 |
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
| [使用指南](USAGE.md) | 日常使用、文件管理、签名生成、图片处理 |
| [架构说明](docs/architecture.md) | 系统架构、请求流程、组件设计 |
| [事故手册](docs/runbook.md) | **事故响应流程与紧急处置指南** |
| [演练报告](docs/migration-dryrun-report.md) | 迁移引擎可靠性演练记录 |
| [配置说明](docs/configuration.md) | 环境变量、KV 配置、wrangler 配置 |
| [部署指南](docs/deployment.md) | 部署到 Cloudflare Workers 完整步骤 |
| [API 参考](docs/api-reference.md) | 所有 API 端点详细说明 |
| [安全指南](docs/security.md) | 安全机制与最佳实践 |

---

## License

[MIT](LICENSE)