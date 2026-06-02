# Edge Image Gateway

> 基于 Cloudflare Workers + GitHub 构建的边缘图片网关，具备图片托管、实时处理、多仓库管理、访问控制及管理面板等企业级功能。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/edge-image-gateway)

---

## 特性一览

| 特性 | 说明 |
|------|------|
| **图片托管** | 基于 GitHub 仓库作为后端存储，Workers 作为分发层 |
| **实时图片处理** | 利用 Cloudflare Image Resizing 实现实时缩放、裁剪、格式转换 |
| **多仓库支持** | 支持多 GitHub 仓库作为存储池，自动路由读写，按容量自动切换 |
| **管理面板** | 内置 Web 管理界面，支持文件浏览、上传、删除、仓库管理 |
| **访问控制** | Referer 防盗链、HMAC 签名认证、IP 速率限制、紧急熔断 |
| **管理安全** | Cloudflare Access / TOTP 双重管理认证 |
| **缓存策略** | 多级缓存（Workers Cache + Cloudflare Edge），智能 TTL |
| **可观测性** | 结构化日志（Sentry / Telegram 告警）、Cloudflare Analytics |
| **分享功能** | 生成带签名和过期时间的临时分享链接 |
| **审计日志** | 记录所有删除和敏感操作，支持追溯 |
| **自动索引** | 懒加载路径索引，上传后自动回填 KV，无需手动维护映射 |

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
                    │  ┌──── 路由 & 处理 ──┐│
                    │  │ • 图片请求分发     ││
                    │  │ • 实时 Resize      ││
                    │  │ • 缓存管理         ││
                    │  │ • 访问控制         ││
                    │  │ • 管理面板         ││
                    │  └───────────────────┘│
                    └─────────┬────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
  ┌───────▼───────┐   ┌──────▼──────┐   ┌───────▼───────┐
  │  GitHub Repo 1 │   │ GitHub Repo 2│   │ GitHub Repo N│
  │  (图片存储)    │   │ (图片存储)   │   │ (图片存储)    │
  └───────────────┘   └─────────────┘   └───────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │   Cloudflare KV      │
                    │  (仓库注册表 / 路径   │
                    │   索引 / 配置)        │
                    └──────────────────────┘
```

详细架构说明见 [docs/architecture.md](docs/architecture.md)。

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Cloudflare 账号](https://dash.cloudflare.com/)
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（已配置）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/edge-image-gateway.git
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

### 部署

```bash
# 部署到 Cloudflare Workers
pnpm deploy
```

详细部署指南见 [docs/deployment.md](docs/deployment.md)。

---

## 配置

核心配置项包括：

| 变量 | 必填 | 说明 |
|------|------|------|
| `GITHUB_USER` | 是 | GitHub 用户名 / 组织名 |
| `GITHUB_REPO` | 是 | 默认 GitHub 仓库名 |
| `GITHUB_BRANCH` | 是 | 仓库分支（默认 `main`） |
| `GITHUB_TOKEN` | 是 | GitHub Personal Access Token（Secret） |
| `SIGN_SECRET` | 是 | HMAC 签名密钥，用于分享链接和内部回环认证（Secret） |
| `ALLOWED_REFERERS` | 否 | 防盗链白名单（逗号分隔） |
| `CACHE_TTL_SECONDS` | 否 | 缓存 TTL（默认 `604800`，即 7 天） |
| `ENABLE_SIGNATURE` | 否 | 是否启用上传签名认证（默认 `false`） |
| `RATE_LIMIT_PER_MIN` | 否 | 每分钟每 IP 最大请求数（默认 `120`） |
| `APP_TITLE` | 否 | 首页展示标题（默认 `Edge Image Gateway`） |
| `APP_DESCRIPTION` | 否 | 首页展示描述 |
| `ADMIN_EMAILS` | 否 | 管理员邮箱白名单，逗号分隔（用于 Cloudflare Access 认证） |
| `ADMIN_TOTP_SECRET` | 否 | TOTP 密钥，用于管理面板双因素认证（Secret） |
| `EMERGENCY_LOCKDOWN` | 否 | 紧急熔断开关（设为 `"true"` 拒绝所有写操作） |
| `CF_ZONE_ID` | 否 | Cloudflare Zone ID，用于管理面板缓存清除 |
| `CF_API_TOKEN` | 否 | Cloudflare API Token，需 `zone:purge` 权限（Secret） |
| `TELEGRAM_BOT_TOKEN` | 否 | Telegram 告警机器人 Token（Secret） |
| `TELEGRAM_CHAT_ID` | 否 | Telegram 告警聊天 ID（Secret） |
| `SENTRY_DSN` | 否 | Sentry 错误监控 DSN（Secret） |
| `ANALYTICS_ENGINE` | 否 | Cloudflare Analytics Engine 数据集绑定 |

完整配置说明见 [docs/configuration.md](docs/configuration.md)。

---

## API 总览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 首页（展示 APP_TITLE 和 APP_DESCRIPTION） |
| `/healthz` | GET | 健康检查 |
| `/{path}` | GET | 获取图片或文件（支持实时处理参数） |
| `/{path}?w=200&h=200&format=webp` | GET | 获取处理后的图片 |
| `/{path}?list` | GET | 列出目录内容 |
| `/upload` | POST | 上传图片（可配置签名认证） |
| `/share/{path}` | GET | 生成带签名的分享链接 |
| `/admin` | GET | 管理面板 |
| `/admin/api/upload` | POST | 上传图片（管理认证） |
| `/admin/api/files` | GET | 列出文件（分页、目录浏览） |
| `/admin/api/files/*` | DELETE | 删除文件 |
| `/admin/api/files/move` | POST | 移动/重命名文件 |
| `/admin/api/files/sign` | POST | 生成分享链接 |
| `/admin/api/repos` | GET/POST | 仓库列表 / 创建仓库 |
| `/admin/api/repos/:id` | GET/PUT/DELETE | 仓库详情 / 更新 / 删除 |
| `/admin/api/stats` | GET | 系统统计 |
| `/admin/api/audit` | GET | 审计日志 |
| `/admin/api/cache/purge` | POST | 清除缓存 |

详细 API 文档见 [docs/api-reference.md](docs/api-reference.md)。

---

## 管理面板

内置 Web 管理面板，提供：

- **文件浏览** — 目录树导航、文件搜索、批量删除、上传、新建文件夹
- **回收站** — 查看删除记录、清空回收站
- **审计日志** — 查看所有敏感操作的审计记录
- **API 令牌管理** — 生成、吊销 API 访问令牌
- **仓库管理** — 注册、配置、监控多 GitHub 仓库，统计面板

详细说明见 [docs/admin-panel.md](docs/admin-panel.md)。

---

## 安全

- **防盗链** — Referer 请求头白名单校验
- **签名认证** — 上传和分享使用 HMAC-SHA256 签名
- **速率限制** — 基于 IP 的令牌桶限流
- **紧急熔断** — 一键关闭所有写入和上传
- **管理安全** — Cloudflare Access (Zero Trust) 或 TOTP 认证

详细安全文档见 [docs/security.md](docs/security.md)。

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

## 技术栈

| 技术 | 用途 |
|------|------|
| [Cloudflare Workers](https://workers.cloudflare.com/) | 无服务器边缘计算平台 |
| [Hono](https://hono.dev/) | 轻量级 Web 框架 |
| [wrangler](https://developers.cloudflare.com/workers/wrangler/) | Workers 部署工具 |
| [Cloudflare KV](https://developers.cloudflare.com/kv/) | 键值存储（仓库注册表、配置） |
| [Cloudflare Image Resizing](https://developers.cloudflare.com/images/image-resizing/) | 实时图片处理 |
| [Cloudflare Access](https://www.cloudflare.com/zero-trust/access/) | Zero Trust 管理认证 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全的开发语言 |
| [GitHub API](https://docs.github.com/en/rest) | 图片文件的后端存储 |
| [Zod](https://zod.dev/) | 运行时数据校验 |
| [Vitest](https://vitest.dev/) | 单元测试框架 |

---

## License

[MIT](LICENSE)
