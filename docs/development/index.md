# 开发指南

本地开发、项目结构和调试说明。

## 项目结构

```
picbed-cf-GitHub/
├── src/                  # Worker 源码
│   ├── index.ts          # 入口
│   ├── routes/           # 路由处理器（含管理面板前端集成在 routes/admin/）
│   ├── middleware/        # 中间件（限流、签名、认证、防盗链）
│   ├── services/         # 业务逻辑（GitHub API、D1 数据库、缓存）
│   ├── utils/            # 工具函数
│   └── types/            # 类型定义
├── scripts/              # 工具脚本和数据库 Schema
│   ├── sign.ts           # 签名生成脚本
│   └── schema.sql        # D1 数据库 Schema
├── tests/                # 测试文件
│   ├── index.spec.ts     # 集成测试
│   ├── helpers/          # 测试辅助工具
│   └── unit/             # 单元测试
├── docs/                 # 文档
├── wrangler.toml.example # 配置模板
├── wrangler.toml         # Cloudflare 配置（不提交秘密）
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 本地开发

```bash
pnpm install
pnpm dev          # 启动 Worker 开发服务器（http://localhost:8787）
pnpm test         # 运行测试
pnpm typecheck    # 类型检查
```

## 技术栈

- **运行时**：Cloudflare Workers
- **框架**：Hono
- **存储**：R2（缓存） + D1（元数据） + KV（配置）
- **后端存储**：GitHub API
- **前端**：管理面板集成在 `src/routes/admin/`，无独立前端项目（Hono 服务端渲染 HTML + 内联 TypeScript）

详细说明请参考 [开发指南](development.md)。