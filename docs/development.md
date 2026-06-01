# 开发与测试指南

## 环境要求

- **Node.js** 18+
- **pnpm** 10+
- **Wrangler CLI** 3.x

---

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 wrangler.toml

```bash
cp wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml`，填入 GitHub 信息和配置项。详见 [配置参考](./configuration.md)。

### 3. 设置 Secrets（如果需要）

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SIGN_SECRET
```

### 4. 启动开发服务器

```bash
pnpm dev
```

该命令会启动 Wrangler 开发服务器，默认监听 `http://localhost:8787`。

### 5. 本地测试

```bash
# 访问健康检查端点
curl http://localhost:8787/healthz

# 访问图片（如果已配置仓库）
curl http://localhost:8787/test.png
```

> **注意**：Wrangler 本地开发模式默认使用 `wrangler.toml` 中的环境变量。如需使用 Secrets，需要在本地开发时通过 `.dev.vars` 文件设置。

### 6. 本地开发时的 Secrets 管理

创建 `.dev.vars` 文件（已加入 `.gitignore`）：

```bash
# .dev.vars
GITHUB_TOKEN=your_github_token_here
SIGN_SECRET=your_sign_secret_here
```

Wrangler 会自动读取 `.dev.vars` 文件中的变量作为本地 Secrets。

---

## 测试

### 运行测试

```bash
pnpm test
```

### 测试框架

项目使用 [Vitest](https://vitest.dev/) + `@cloudflare/vitest-pool-workers` 作为测试框架。

### 测试文件位置

所有测试文件位于 `tests/` 目录下：

```
tests/
└── index.spec.ts    # 基础测试（健康检查端点）
```

### 编写测试

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('健康检查', () => {
  it('应返回 200 和正确状态', async () => {
    const response = await env.ASSETS.fetch('http://localhost/healthz');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});
```

### 测试注意事项

- `cloudflare:test` 模块仅在测试环境中可用
- 测试会自动使用 Wrangler 配置中的环境变量
- 目前测试覆盖度较低，建议为以下模块补充测试：
  - 签名验证逻辑
  - 防盗链中间件
  - 限流中间件
  - 图片处理流程
  - 多仓库路由

---

## TypeScript 类型检查

### 运行类型检查

```bash
pnpm typecheck
```

底层执行 `tsc --noEmit`，检查所有 `.ts` 文件的类型正确性。

### 类型定义

项目类型定义位于 [src/types/env.d.ts](../src/types/env.d.ts)，包括：

- `Env`：环境变量和绑定类型
- 各类请求/响应接口

---

## 项目脚本

```json
{
  "scripts": {
    "dev":      "wrangler dev",
    "deploy":   "wrangler deploy",
    "test":     "vitest run",
    "typecheck":"tsc --noEmit"
  }
}
```

---

## 代码结构

```
src/
├── index.ts              # 应用入口，路由注册
├── middleware/
│   ├── rateLimit.ts      # 限流中间件
│   ├── referer.ts        # 防盗链中间件
│   ├── signature.ts      # 签名验证中间件
│   └── adminAuth.ts      # 管理员认证中间件
├── routes/
│   ├── image.ts          # 图片处理路由
│   ├── admin.ts          # 管理后台路由入口
│   └── admin/
│       ├── partials.ts   # HTML 模板片段
│       ├── styles.ts     # CSS 样式
│       ├── scripts.ts    # JS 脚本聚合
│       ├── scripts/      # 前端 JS 模块
│       └── api/          # 管理后台 API
├── services/
│   ├── github.ts         # GitHub API 交互
│   ├── repoRouter.ts     # 多仓库路由
│   └── cron.ts           # 定时任务
└── utils/
    ├── hmac.ts           # HMAC 签名
    ├── hash.ts           # SHA-256 哈希
    ├── mime.ts           # MIME 类型映射
    └── logger.ts         # 结构化日志
```

---

## 开发规范

### 代码风格

- 使用 TypeScript 强类型
- 遵循现有代码的命名规范和结构
- 根据规则要求：**不添加不必要的注释**

### 工具链

- **包管理器**：pnpm
- **测试框架**：Vitest
- **文档**：Markdown，存放于 `docs/` 目录

---

## 常见问题

### Q: 本地开发时无法访问 GitHub API？

确保已设置 `GITHUB_TOKEN` Secret，且 Token 具有对应仓库的 `Contents: Read and write` 权限。

### Q: 图片缩放在本地不工作？

Cloudflare Image Resizing 是 Cloudflare 付费功能，在本地 Wrangler 开发环境中不可用。本地开发时，缩放参数将被忽略，直接返回原始图片。

### Q: 如何调试中间件？

中间件按顺序执行：限流 → 签名 → 防盗链。可以在响应头中添加调试信息，或在 Cloudflare Dashboard 中查看 Worker 日志。

### Q: KV 在本地如何模拟？

Wrangler 开发服务器会自动创建本地 KV 模拟环境，无需额外配置。但请注意，本地 KV 数据不会同步到生产环境。