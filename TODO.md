# 生产化补强 TODO

这是一份基于 `plan.md` 和 `task.md` 的 Edge Image Gateway 生产化补强实施清单。

## P0: 核心底线 (安全与正确性)
- [x] **P0-1: 核心模块测试**
  - [x] 设立 `tests/unit/` 目录结构和 `helpers/mockKV.ts`
  - [x] 编写 `tests/unit/repoRouter.spec.ts` (路由决策与超限切换)
  - [x] 编写 `tests/unit/signature.spec.ts` (HMAC 签名校验防绕过)
  - [x] 编写 `tests/unit/rateLimit.spec.ts` (限流与时间补充)
- [x] **P0-2: 生产环境隐藏堆栈信息**
  - [x] 在 `src/types/env.d.ts` 的 `Bindings` 中增加 `ENVIRONMENT: string`
  - [x] 在 `wrangler.toml.example` (以及用户的 `wrangler.toml` 若有) 增加 `ENVIRONMENT = "production"`
  - [x] 修改 `src/index.ts` 的 `app.onError`，生产环境隐藏堆栈并返回随机 `errorId` 关联 Sentry/Telegram

## P1: 可靠性与闭环
- [x] **P1-1: GitHub Rate Limit 监控与告警**
  - [x] 修改 `src/services/github.ts`，解析速率头并记录到 KV
  - [x] 修改 `src/index.ts` 的 `/healthz`，返回 KV 中的各仓库速率限制信息
  - [x] (可选) Cron 同步前检查配额，避免耗尽
- [x] **P1-2: 多仓库迁移工具 (Draining 闭环)**
  - [x] 在 `src/services/migration.ts` (或扩展现有的 mutate.ts) 中实现完整的 `draining` 迁移逻辑（支持断点续传）
  - [x] 在 `/admin/api/repos/:id/migrate` 提供启动迁移的 API
  - [x] 在 `src/services/cron.ts` 中添加被中断任务的自动续跑逻辑

## P2: 权限与配置防呆
- [x] **P2-1: 令牌权限粒度与生命周期**
  - [x] 扩展 Token 数据模型，增加 `scopes` (read/write/delete)、`pathPrefix`、`expiresAt`、`lastUsedAt`
  - [x] 统一改造令牌鉴权中间件以支持细粒度权限校验
  - [x] 更新对应的管理 API 和 UI，兼容新的令牌结构
- [x] **P2-2: 启动期配置自检**
  - [x] 使用 `zod` 在 `src/utils/configCheck.ts` 中编写必需环境变量和成对变量的 Schema 校验
  - [x] 在 `/healthz` 端点中集成配置检查结果，缺失时不打印明文仅报字段错误

## P3: 文档与实现对齐
- [x] **P3: 回收站数据模型对齐**
  - [x] 确定回收站方案（真删并修改文档 vs. 软删存 KV 并加定期清理）
  - [x] 落地代码或文档更改，确保行为与描述一致
