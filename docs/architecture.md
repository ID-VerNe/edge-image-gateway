# 系统架构

> 本文档侧重于模块级架构（组件设计、KV 键模型、错误处理）。完整的系统全景图、请求生命周期和缓存体系见 [架构总览](architecture-overview.md)。

## 总体架构

Edge Image Gateway 是一个运行在 Cloudflare Workers 上的无服务器边缘应用程序，使用 GitHub 仓库作为后端存储层，Cloudflare KV 作为元数据和配置存储。

```
                    ┌──────────────────────────────────────┐
                    │              客户端层                  │
                    │  • 浏览器 / App / curl / 图床客户端    │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │          Cloudflare 边缘网络          │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │    Workers (Edge Image Gateway)  │  │
                    │  │                                  │  │
                    │  │  请求入口 ──► 中间件链 ──► 路由   │  │
                    │  │                                  │  │
                    │  │  中间件栈:                       │  │
                    │  │  • Rate Limiter (令牌桶)          │  │
                    │  │  • Referer Guard (防盗链)         │  │
                    │  │  • Signature Guard (签名/熔断)    │  │
                    │  └────────────┬───────────────────┘  │
                    └───────────────┼──────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
  ┌───────▼──────────┐    ┌────────▼────────┐    ┌───────────▼───────┐
  │  GitHub Repo 1   │    │ GitHub Repo 2   │    │  GitHub Repo N    │
  │  active          │    │ readonly         │    │  draining/archived│
  │  容量: 5GB       │    │ 容量: 2GB       │    │  容量: 1GB        │
  └──────────────────┘    └─────────────────┘    └───────────────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────────┐
                    │        Cloudflare KV (REPO_REGISTRY)    │
                    │                                        │
                    │  repo::{id}    → RepoMeta (仓库元数据)  │
                    │  route::read_rules  → ReadRule[] (路由) │
                    │  route::current_write → string (写仓库) │
                    │  path::{path}  → PathRecord (路径索引)  │
                    │  audit::{timestamp} → AuditEntry (审计) │
                    │  kv_config::{key} → string (功能开关)   │
                    └────────────────────────────────────────┘
```

---

## 请求处理流程

> 详细的请求生命周期（中间件链、图片处理回环、上传全链路、分享链接验证）见 [架构总览 - 请求生命周期](architecture-overview.md#3-请求生命周期)。

### 中间件链（概要）

中间件按顺序执行，任何中间件返回响应则终止链：

| 中间件 | 文件 | 职责 |
|--------|------|------|
| 速率限制 | [rateLimit.ts](../src/middleware/rateLimit.ts) | IP 级别令牌桶限流 + 404 封禁 |
| 防盗链 | [referer.ts](../src/middleware/referer.ts) | Referer 白名单校验 + Sec-Fetch-Dest 智能放行 |
| 签名认证+熔断 | [signature.ts](../src/middleware/signature.ts) | HMAC-SHA256 签名验证 + 紧急熔断 + 分级路径防御 |
| 管理认证 | [adminAuth.ts](../src/middleware/adminAuth.ts) | API Token / Cloudflare Access / TOTP 认证（仅 `/admin` 路径） |

### 路由分发逻辑

路由引擎 [repoRouter.ts](../src/services/repoRouter.ts) 是多仓库的核心路由引擎：

- **KV 缓存** — 30 秒内内存缓存仓库元数据，减少 KV 读取
- **路径索引** — 先查精确路径索引，再查前缀匹配，再查路由规则
- **读路由** — 按 `ReadRule[]` 前缀匹配，未匹配则使用当前写仓库
- **写路由** — 自动选择有剩余空间的活跃仓库，超容量自动切换
- **兜底策略** — KV 不可用时回退到环境变量中的默认仓库

### 2. GitHub 存储服务

[github.ts](../src/services/github.ts) 封装了所有 GitHub API 调用：

| 方法 | 用途 |
|------|------|
| `fetchRaw` | 获取文件原始内容 |
| `getFile` | 获取文件元数据 |
| `fileExists` | 检查文件是否存在 |
| `putFile` | 上传/更新文件 |
| `deleteFile` | 删除文件 |
| `getTree` | 获取仓库目录树 |
| `createRepository` | 创建新仓库 |

### 3. 管理面板 API

管理面板由多个子路由组成：

| API 模块 | 文件 | 功能 |
|----------|------|------|
| Repos | [repos.ts](../src/routes/admin/api/repos.ts) | 仓库 CRUD、状态管理 |
| Files | [files.ts](../src/routes/admin/api/files.ts) | 文件列表、目录树、删除 |
| Upload | [upload.ts](../src/routes/admin/api/upload.ts) | 单文件/批量上传 |
| Stats | [stats.ts](../src/routes/admin/api/stats.ts) | 统计和监控数据 |
| Audit | [audit.ts](../src/routes/admin/api/audit.ts) | 审计日志查询 |

### 4. 缓存策略

多级缓存提升性能：

| 缓存层级 | 说明 | TTL |
|----------|------|-----|
| Workers Cache (Cloudflare CDN) | 成功响应的边缘缓存 | 默认 7 天（可配置） |
| 404 缓存 | 防止频繁请求不存在的文件 | 60 秒 |
| 缓存变体 | 带查询参数（w, h, q, fit）的请求独立缓存 | 与主缓存相同 |
| 内存缓存 | 仓库元数据内存缓存 | 30 秒 |

**缓存控制头：**

```
Cache-Control: public, max-age=604800, s-maxage=604800, immutable
```

---

## KV 键设计

| 键模式 | 值类型 | 说明 |
|--------|--------|------|
| `repo::{id}` | `RepoMeta` JSON | 仓库元数据 |
| `route::read_rules` | `ReadRule[]` JSON | 读路由规则 |
| `route::current_write` | `string` | 当前写仓库 ID |
| `path::{path}` | `PathRecord` JSON | 文件路径 → 仓库映射 |
| `audit::{timestamp}` | `AuditEntry` JSON | 审计日志条目 |
| `kv_config::emergency_lockdown` | `string` | 紧急熔断标志 |
| `kv_config::max_file_size` | `string` | 文件大小限制 |
| `kv_config::allowed_types` | `string` | 允许的文件类型 |
| `kv_config::upload_prefix` | `string` | 上传路径前缀 |
| `share_token::{id}` | `ShareToken` JSON | 分享令牌 |
| `cache_variants::{path}` | `string[]` JSON | 缓存变体列表 |

---

## 错误处理架构

```
请求处理过程中发生异常
       │
       ▼
┌──────────────────┐
│ 全局错误处理器    │
│ (app.onError)    │
└────────┬─────────┘
         │
         ├──► 记录错误日志 (console.error)
         │
         ├──► 上报 Sentry (如已配置)
         │
         ├──► 发送 Telegram 告警 (5xx 错误)
         │
         └──► 返回标准 JSON 错误响应
              {
                "error": "Unhandled Exception",
                "message": "错误详情",
                "stack": "堆栈信息"
              }
```

---

## Cron 定时任务

系统注册了定时触发器，用于自动同步各仓库的容量统计：

- **触发频率**：可配置（建议每 6 小时）
- **任务内容**：遍历所有仓库，从 GitHub API 获取实际文件数和大小
- **更新 KV**：将统计结果写入 `repo::{id}` 的 `sizeBytes` 和 `fileCount` 字段
- **触发告警**：容量接近上限时发送 Telegram 通知