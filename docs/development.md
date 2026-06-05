# 开发指南

## 环境准备

### 前置依赖

| 工具 | 版本要求 | 安装方式 |
|------|----------|----------|
| Node.js | >= 18 | [nodejs.org](https://nodejs.org/) |
| pnpm | >= 9（`package.json` 中 `packageManager` 指定为 `pnpm@10.27.0`） | `npm install -g pnpm` |
| wrangler | 最新 | `pnpm add -g wrangler` |

### 本地开发环境搭建

```bash
# 克隆项目
git clone <repo-url>
cd edge-image-gateway

# 安装依赖
pnpm install

# 复制环境配置
copy wrangler.toml.example wrangler.toml

# 编辑 wrangler.toml，填入必要的配置项
# 至少要配置 GITHUB_USER、GITHUB_REPO、GITHUB_TOKEN
```

### 启动开发服务器

```bash
# 使用本地模拟的 Workers 环境
pnpm dev
```

开发服务器会在 `http://localhost:8787` 启动，支持热更新。

> **注意：**
> - 本地开发时，GitHub API 调用是真实的，需要配置有效的 `GITHUB_TOKEN`
> - KV 本地模拟使用 `wrangler dev --local`，数据存储在 `.wrangler/state/v3/kv` 目录中
> - 图片处理（Image Resizing）功能在本地开发环境中不可用，需部署后测试

---

## 项目结构

```
edge-image-gateway/
├── src/
│   ├── index.ts                  # 入口：应用初始化、路由注册、Cron 触发器
│   ├── routes/
│   │   ├── admin.ts              # 管理面板路由聚合（HTML + API）
│   │   ├── image.ts              # 图片处理路由（GET、POST、DELETE、列表、分享）
│   │   └── admin/
│   │       ├── api/
│   │       │   ├── audit.ts      # 审计日志 API
│   │       │   ├── backfill.ts   # 路径索引回填
│   │       │   ├── files.ts      # 文件管理主路由
│   │       │   ├── repos.ts      # 仓库管理 API
│   │       │   ├── stats.ts      # 统计 API
│   │       │   ├── upload.ts     # 上传 API（管理面板）
│   │       │   └── files/
│   │       │       ├── mutate.ts # 文件修改（删除）
│   │       │       ├── query.ts  # 文件查询
│   │       │       └── share.ts  # 分享管理
│   │       ├── scripts/
│   │       │   ├── actions.ts    # 操作聚合
│   │       │   ├── events.ts     # 事件处理
│   │       │   ├── navigation.ts # 导航逻辑
│   │       │   ├── render.ts     # 模板渲染引擎
│   │       │   ├── scripts.ts    # 脚本聚合
│   │       │   ├── selection.ts  # 选择逻辑
│   │       │   ├── state.ts      # 前端状态管理
│   │       │   ├── utils.ts      # 前端工具函数
│   │       │   └── actions/
│   │       │       ├── fileActions.ts  # 文件操作
│   │       │       ├── repoActions.ts  # 仓库操作
│   │       │       ├── shareActions.ts # 分享操作
│   │       │       └── tokenActions.ts # Token 操作
│   │       ├── partials.ts       # HTML 模板片段
│   │       ├── scripts.ts        # 前端脚本注入
│   │       └── styles.ts         # 前端样式注入
│   ├── middleware/
│   │   ├── adminAuth.ts          # 管理员认证
│   │   ├── rateLimit.ts          # 速率限制（令牌桶）
│   │   ├── referer.ts            # 防盗链（Referer 白名单）
│   │   └── signature.ts          # 签名认证 + 紧急熔断检查
│   ├── services/
│   │   ├── cron.ts               # 定时任务
│   │   ├── database.ts           # D1/KV 数据访问层（一致性封装）
│   │   ├── github.ts             # GitHub API 封装
│   │   ├── repoMigration.ts      # 跨仓库迁移引擎（断点续传）
│   │   └── repoRouter.ts         # 多仓库路由引擎
│   ├── utils/
│   │   ├── cache.ts              # 缓存管理
│   │   ├── configCheck.ts        # 启动自检（Zod Schema 校验）
│   │   ├── hash.ts               # 哈希工具
│   │   ├── hmac.ts               # HMAC 签名工具
│   │   ├── imageProcessor.ts     # 图片处理（EXIF 剥离）
│   │   ├── logger.ts             # 日志记录
│   │   ├── mime.ts               # MIME 类型映射
│   │   ├── notifications.ts      # 通知推送（Telegram）
│   │   └── r2Cache.ts            # R2 缓存集成
│   └── types/
│       └── env.d.ts              # 环境变量 Bindings 类型
├── scripts/
│   ├── sign.ts                   # 签名生成脚本（独立使用）
│   └── schema.sql                # 数据库 Schema 参考
├── tests/
│   └── index.spec.ts             # 测试文件
├── docs/                         # 文档目录
├── wrangler.toml.example         # 配置模板
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 核心架构

```
请求 → Hono App → 中间件链 → 路由匹配 → Handler → 响应
```

### 中间件链

中间件按顺序执行，每个中间件可以：

- **返回响应** — 终止链，直接返回（如权限不足时返回 403）
- **继续传递** — 调用 `next()` 交由下一个中间件处理
- **修改上下文** — 在 `c.set()` 中设置变量，供后续中间件和 Handler 使用

**当前中间件顺序（按注册顺序执行）：**

| 顺序 | 中间件 | 作用范围 | 说明 |
|------|--------|----------|------|
| 1 | `rateLimitGuard` | 全局 | 基于令牌桶算法，可配置 `RATE_LIMIT_PER_MIN` |
| 2 | `refererGuard` | 全局 | 检查 Referer 白名单，支持通配符 |
| 3 | `signatureGuard` | 全局 | 验证 HMAC 签名，检查紧急熔断状态 |
| 4 | `adminAuthGuard` | `/admin` 及 `/admin/*` | Cloudflare Access 或 TOTP 认证 |

> 紧急熔断并非独立中间件，而是在 `signatureGuard` 内部通过检查 `EMERGENCY_LOCKDOWN` 环境变量或 KV 中的动态配置实现的快速返回机制。

### 路由设计

```typescript
// src/index.ts — 入口
const app = new Hono<AppEnvironment>();

// 健康检查（无中间件，确保不受限流/防盗链影响）
app.get('/healthz', (c) => { ... });

// 全局中间件（按顺序注册）
app.use('/*', rateLimitGuard);
app.use('/*', refererGuard);
app.use('/*', signatureGuard);

// 全局错误处理
app.onError((err, c) => { ... });

// 管理面板路由（adminRouter 内部应用 adminAuthGuard）
app.route('/admin', adminApp);

// 图片处理路由（GET /:path、POST /upload、DELETE /:path 等）
app.get('/*', handleImageRequest);

// Cron 触发器
export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    ctx.waitUntil(syncCapacity(env, ctx));
  }
};
```

---

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件（需文件存在）
pnpm test -- tests/index.spec.ts

# 监听模式（开发时使用）
pnpm test -- --watch

# 覆盖率报告
pnpm test -- --coverage
```

### 测试框架

项目使用 [Vitest](https://vitest.dev/) 配合 `@cloudflare/vitest-pool-workers` 插件，在 Cloudflare Workers 模拟环境中运行测试。

**测试类型：**

| 类型 | 说明 | 文件示例 |
|------|------|----------|
| 单元测试 | 测试单个模块功能 | `tests/unit/rateLimit.spec.ts`、`signature.spec.ts`、`configCheck.spec.ts` |
| 集成测试 | 测试模块间交互 | `tests/index.spec.ts` |
| 一致性测试 | 验证 D1/KV 双写一致性 | `tests/unit/consistency.spec.ts` |
| 路由测试 | 验证多仓库路由逻辑 | `tests/unit/repoRouter.spec.ts` |

### 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
});
```

---

## 构建

```bash
# 构建生产版本（由 wrangler 自动执行）
npx wrangler deploy --dry-run

# 查看构建产物大小
npx wrangler deploy --dry-run --outdir dist
```

---

## 代码风格

项目使用 TypeScript 严格模式，遵循以下约定：

- **命名** — 使用 camelCase（变量、函数）、PascalCase（类、类型、接口）
- **导入** — 使用 ES Module 语法
- **类型** — 优先使用 interface 描述对象类型，type 用于联合类型和工具类型
- **错误处理** — 使用 `try/catch` 包装异步操作，返回标准错误响应
- **文件组织** — 按功能模块组织，路由放在 `routes/`，中间件放在 `middleware/`，服务放在 `services/`

### 类型定义

核心类型定义在 `src/types/env.d.ts` 中：

```typescript
interface AppEnvironment {
  Bindings: {
    // KV
    REPO_REGISTRY: KVNamespace;
    
    // 必需变量
    GITHUB_USER: string;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
    GITHUB_TOKEN: string;
    SIGN_SECRET: string;
    
    // 可选变量
    APP_TITLE?: string;
    APP_DESCRIPTION?: string;
    ALLOWED_REFERERS?: string;
    CACHE_TTL_SECONDS?: string;
    ENABLE_SIGNATURE?: string;
    RATE_LIMIT_PER_MIN?: string;
    ADMIN_EMAILS?: string;
    ADMIN_TOTP_SECRET?: string;
    EMERGENCY_LOCKDOWN?: string;
    CF_ZONE_ID?: string;
    CF_API_TOKEN?: string;
    SENTRY_DSN?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    ANALYTICS_ENGINE?: AnalyticsEngineDataset;
  };
  Variables: {
    // 中间件设置的上下文变量
  };
}
```

---

## 调试

### 本地调试

1. 启动开发服务器：`pnpm dev`
2. 使用 `console.log` 或 `console.error` 输出，会显示在终端
3. 使用 `c.get("var_name")` 获取中间件设置的上下文变量
4. wrangler 会在终端输出请求日志

### 生产调试

| 方式 | 说明 |
|------|------|
| **Sentry** | 配置 `SENTRY_DSN` 后，未捕获异常自动上报 |
| **Telegram 告警** | 配置 `TELEGRAM_BOT_TOKEN` 后，系统异常和热阈值触发告警 |
| **Cloudflare Dashboard** | 查看 Workers 的实时日志（`wrangler tail`）和性能指标 |
| **Analytics Engine** | 配置后可通过 SQL 查询详细的请求指标 |
| **wrangler tail** | 实时查看生产环境日志：`npx wrangler tail` |

```bash
# 实时查看生产日志
npx wrangler tail

# 过滤特定状态码
npx wrangler tail --status 500
```

---

## 构建脚本

### sign.ts

用于本地生成 HMAC 签名，方便调试上传和删除操作：

```bash
# 生成 GET 请求签名
npx tsx scripts/sign.ts GET /test.jpg 1717200000

# 生成 POST 请求签名（含 body）
npx tsx scripts/sign.ts POST /upload 1717200000 '{"file":"..."}'
```

### schema.sql

包含 KV 键的设计参考和数据结构说明，用于理解系统的数据模型。

---

## 发布流程

```bash
# 1. 确保类型检查通过
pnpm typecheck

# 2. 确保测试通过
pnpm test

# 3. 部署到生产环境
pnpm deploy

# 4. 验证部署
curl https://{你的域名}/healthz
```

---

## 贡献指南

1. Fork 项目并创建功能分支
2. 确保所有现有测试通过：`pnpm test`
3. 确保类型检查通过：`pnpm typecheck`
4. 为新功能添加测试
5. 提交 Pull Request 并附上详细说明

### Pull Request 清单

- [ ] 代码遵循项目的代码风格
- [ ] 为新增功能编写了测试
- [ ] 所有现有测试通过
- [ ] 类型检查通过（`pnpm typecheck`）
- [ ] 更新了相关文档
- [ ] 没有在代码中硬编码任何秘密信息

---

## 延伸阅读

- [架构总览](architecture-overview.md) — 系统全景、请求生命周期、缓存体系
- [架构说明](architecture.md) — 模块设计、数据流、D1/KV 一致性
- [文档导航](index.md) — 所有文档的快速索引