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
| **存储** | 多仓库支持 & 迁移 | 支持多 GitHub 仓库，提供 Draining 状态与可视化跨仓库文件自动迁移工具 |
| **图片处理** | 实时处理 | 基于 Cloudflare Image Resizing 实现缩放、裁剪、格式转换、锐化等 |
| **访问控制** | 多层防护 | Referer 防盗链、HMAC 签名认证、IP 令牌桶限流、紧急熔断开关 |
| **访问控制** | 细粒度 API 令牌 | 生成带有效期的 API 访问令牌，支持作用域 (读/写/删) 和路径前缀限制 |
| **管理** | Web 管理面板 | 内置管理界面，支持文件浏览、上传、批量操作、仓库管理、审计日志 |
| **管理** | 双因素认证 | 支持 Cloudflare Access (Zero Trust) 或 TOTP 双因素认证保护管理面板 |
| **缓存** | 多级缓存 | Workers Cache + Cloudflare CDN 边缘缓存，智能 TTL，自动缓存清除 |
| **分享** | 临时分享链接 | 生成带 HMAC 签名和过期时间的分享 URL，可绕过防盗链检查 |
| **可观测性** | 监控告警 | 结构化日志、Sentry 错误追踪、Telegram 实时告警通知、GitHub Rate Limit 监控 |
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
                    │  │ • 缓存管理         ││
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
                    │   Cloudflare KV      │
                    │  • 仓库注册表        │
                    │  • 路径索引          │
                    │  • 审计日志          │
                    │  • 运行时配置        │
                    └──────────────────────┘
```

详细架构说明见 [docs/architecture.md](docs/architecture.md)。

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Cloudflare 账号](https://dash.cloudflare.com/)
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

# 编辑 wrangler.toml，填入你的环境变量
# 详见 docs/configuration.md

# 类型检查
pnpm typecheck

# 运行测试
pnpm test

# 本地启动开发服务器
pnpm dev
```

开发服务器默认运行在 `http://localhost:8787`。

### 一键部署

```bash
# 部署到 Cloudflare Workers
pnpm deploy
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
│   │       │   ├── repos.ts      # 仓库管理
│   │       │   ├── stats.ts      # 统计查询
│   │       │   ├── audit.ts      # 审计日志
│   │       │   ├── upload.ts     # 管理面板上传
│   │       │   └── files/
│   │       │       ├── mutate.ts # 文件修改（删除/移动）
│   │       │       ├── query.ts  # 文件查询
│   │       │       └── share.ts  # 分享链接管理
│   │       └── scripts/          # 前端 JavaScript 模块
│   │           ├── actions/      # API 操作封装
│   │           ├── render.ts     # 模板渲染引擎
│   │           ├── state.ts      # 前端状态管理
│   │           └── ...
│   ├── middleware/
│   │   ├── rateLimit.ts          # 令牌桶速率限制
│   │   ├── referer.ts            # Referer 防盗链
│   │   ├── signature.ts          # HMAC 签名认证 + 紧急熔断
│   │   └── adminAuth.ts          # 管理员认证（Access / TOTP）
│   ├── services/
│   │   ├── github.ts             # GitHub API 封装
│   │   ├── repoRouter.ts         # 多仓库路由引擎
│   │   ├── cron.ts               # 定时任务（容量同步）
│   │   └── database.ts           # KV 数据访问层
│   ├── utils/
│   │   ├── logger.ts             # 结构化日志
│   │   ├── notifications.ts      # Telegram 告警通知
│   │   ├── cache.ts              # 缓存管理
│   │   ├── hmac.ts               # HMAC 签名
│   │   ├── hash.ts               # 哈希工具
│   │   ├── mime.ts               # MIME 类型映射
│   │   ├── imageProcessor.ts     # 图片处理
│   │   └── r2Cache.ts            # R2 缓存集成
│   └── types/
│       └── env.d.ts              # 环境变量类型定义
├── scripts/
│   ├── sign.ts                   # 签名生成工具
│   └── schema.sql                # 数据库 Schema
├── tests/
│   └── index.spec.ts             # 测试文件
├── docs/                         # 文档目录
├── wrangler.toml.example         # 配置模板
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 配置

核心配置项：

| 变量 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `GITHUB_USER` | 是 | 明文 | GitHub 用户名或组织名 |
| `GITHUB_REPO` | 是 | 明文 | 默认 GitHub 仓库名 |
| `GITHUB_TOKEN` | 是 | Secret | GitHub Personal Access Token（需 `repo` 权限） |
| `GITHUB_BRANCH` | 是 | 明文 | 仓库分支（默认 `main`） |
| `SIGN_SECRET` | 是 | Secret | HMAC 签名密钥，用于分享链接和内部回环认证 |
| `ALLOWED_REFERERS` | 否 | 明文 | 防盗链白名单，逗号分隔 |
| `CACHE_TTL_SECONDS` | 否 | 明文 | 缓存 TTL（秒），默认 `604800`（7 天） |
| `ENABLE_SIGNATURE` | 否 | 明文 | 是否启用上传签名认证，默认 `false` |
| `RATE_LIMIT_PER_MIN` | 否 | 明文 | 每分钟每 IP 最大请求数，默认 `120` |
| `APP_TITLE` | 否 | 明文 | 首页展示标题 |
| `APP_DESCRIPTION` | 否 | 明文 | 首页展示描述 |
| `ADMIN_EMAILS` | 否 | 明文 | 管理员邮箱白名单（Cloudflare Access 认证） |
| `ADMIN_TOTP_SECRET` | 否 | Secret | TOTP 密钥，用于管理面板双因素认证 |
| `EMERGENCY_LOCKDOWN` | 否 | 明文 | 紧急熔断开关，设为 `"true"` 拒绝所有写操作 |
| `CF_ZONE_ID` | 否 | 明文 | Cloudflare Zone ID，用于管理面板缓存清除 |
| `CF_API_TOKEN` | 否 | Secret | Cloudflare API Token（需 `zone:purge` 权限） |
| `TELEGRAM_BOT_TOKEN` | 否 | Secret | Telegram 告警机器人 Token |
| `TELEGRAM_CHAT_ID` | 否 | Secret | Telegram 告警聊天 ID |
| `SENTRY_DSN` | 否 | Secret | Sentry 错误监控 DSN |

完整配置说明见 [docs/configuration.md](docs/configuration.md)。

---

## API 总览

### 公开端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 首页（展示 APP_TITLE 和 APP_DESCRIPTION） |
| `/healthz` | GET | 健康检查，返回服务状态和配置信息 |
| `/{path}` | GET | 获取图片或文件（支持实时处理参数） |
| `/{path}?list` | GET | 列出目录内容 |
| `/upload` | POST | 上传图片（可配置签名认证） |
| `/share/{path}` | GET | 生成带签名的临时分享链接 |

### 管理端点（需认证）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/admin` | GET | 管理面板页面 |
| `/admin/api/upload` | POST | 上传图片 |
| `/admin/api/files` | GET | 列出文件（分页、目录浏览） |
| `/admin/api/files` | DELETE | 删除文件或目录 |
| `/admin/api/files/move` | POST | 移动/重命名文件 |
| `/admin/api/files/sign` | POST | 生成分享链接 |
| `/admin/api/repos` | GET / POST | 列出仓库 / 创建仓库 |
| `/admin/api/repos/:id` | GET / PUT / DELETE | 仓库详情 / 更新 / 删除 |
| `/admin/api/repos/:id/sync` | POST | 同步仓库统计 |
| `/admin/api/stats` | GET | 系统统计概览 |
| `/admin/api/audit` | GET | 审计日志查询 |
| `/admin/api/cache/purge` | POST | 清除缓存 |

详细 API 文档见 [docs/api-reference.md](docs/api-reference.md)。

---

## 管理面板

内置 Web 管理面板，提供：

- **文件浏览** — 目录树导航、文件搜索、网格/列表切换、批量删除、上传、新建文件夹
- **文件预览** — 点击文件查看详情，支持分享链接生成和下载
- **审计日志** — 查看所有敏感操作（上传、删除、配置变更）的审计记录
- **API 令牌** — 生成、吊销 API 访问令牌，用于程序化访问
- **仓库管理** — 注册、配置、监控多 GitHub 仓库，统计面板，写目标切换

详细说明见 [docs/admin-panel.md](docs/admin-panel.md)。

---

## 安全

多层安全防护体系：

| 层级 | 机制 | 说明 |
|------|------|------|
| L1 | 速率限制 | 基于 IP 的令牌桶算法，可配置阈值 |
| L2 | 防盗链 | Referer 请求头白名单校验 |
| L3 | 签名认证 | 写操作和分享链接使用 HMAC-SHA256 签名 |
| L4 | 紧急熔断 | 一键关闭所有写入操作，应对安全事件 |
| L5 | 管理认证 | Cloudflare Access (Zero Trust) 或 TOTP 双因素认证 |
| L6 | 响应头安全 | 清洗敏感上游头，添加 CSP / nosniff / X-Frame-Options |

详细安全文档见 [docs/security.md](docs/security.md)。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| [Cloudflare Workers](https://workers.cloudflare.com/) | 无服务器边缘计算平台 |
| [Hono](https://hono.dev/) | 轻量级 Web 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全的开发语言 |
| [Cloudflare KV](https://developers.cloudflare.com/kv/) | 键值存储（仓库注册表、配置、审计日志） |
| [Cloudflare Image Resizing](https://developers.cloudflare.com/images/image-resizing/) | 实时图片处理 |
| [Cloudflare Access](https://www.cloudflare.com/zero-trust/access/) | Zero Trust 管理认证 |
| [GitHub REST API](https://docs.github.com/en/rest) | 图片文件的后端存储 |
| [Zod](https://zod.dev/) | 运行时数据校验 |
| [Vitest](https://vitest.dev/) | 单元测试框架 |
| [wrangler](https://developers.cloudflare.com/workers/wrangler/) | Workers 部署与管理工具 |

---

## 文档目录

| 文档 | 说明 |
|------|------|
| [使用指南](USAGE.md) | 日常使用、文件管理、签名生成、图片处理 |
| [架构说明](docs/architecture.md) | 系统架构、请求流程、组件设计 |
| [配置说明](docs/configuration.md) | 环境变量、KV 配置、wrangler 配置 |
| [部署指南](docs/deployment.md) | 部署到 Cloudflare Workers 完整步骤 |
| [API 参考](docs/api-reference.md) | 所有 API 端点详细说明 |
| [管理面板](docs/admin-panel.md) | 管理面板功能与使用说明 |
| [安全指南](docs/security.md) | 安全机制与最佳实践 |
| [开发指南](docs/development.md) | 本地开发、测试、贡献指南 |
| [多仓库管理](docs/multi-repo.md) | 多 GitHub 仓库配置与路由规则 |

---

## 贡献指南

欢迎贡献代码、报告问题或提出改进建议。

1. Fork 本仓库并创建功能分支
2. 确保所有现有测试通过：`pnpm test`
3. 为新功能添加测试
4. 确保类型检查通过：`pnpm typecheck`
5. 提交 Pull Request 并附上详细说明

### PR 检查清单

- [ ] 代码风格一致，遵循项目约定
- [ ] 为新增功能编写了测试
- [ ] 所有现有测试通过
- [ ] 类型检查通过
- [ ] 更新了相关文档
- [ ] 没有在代码中硬编码密钥或敏感信息

---

## License

[MIT](LICENSE)