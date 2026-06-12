# 开发指南

本地开发、项目结构和调试说明。

## 项目结构

```
picbed-cf-GitHub/
├── src/                  # Worker 源码
│   ├── index.ts          # 入口
│   ├── routes/           # 路由处理器
│   ├── middleware/        # 中间件（签名、认证、防盗链）
│   ├── services/         # 业务逻辑（GitHub API、缓存）
│   └── utils/            # 工具函数
├── admin-frontend/       # 管理面板前端
├── docs/                 # 文档
└── wrangler.toml         # Cloudflare 配置
```

## 本地开发

```bash
pnpm install
pnpm dev        # 启动 Worker 开发服务器
pnpm dev:admin  # 启动管理面板开发服务器
```

## 技术栈

- **运行时**：Cloudflare Workers
- **框架**：Hono
- **存储**：R2（缓存） + D1（元数据） + KV（配置）
- **后端存储**：GitHub API
- **前端**：管理面板为独立前端项目

详细说明请参考 [开发指南](development.md)。