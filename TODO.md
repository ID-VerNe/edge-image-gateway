# Edge Image Gateway - 交付验收阶段 (P-A to P-E)

## [x] P-A. D1 双写一致性验证
- [x] 审计 `database.ts` 及调用方，确立 "D1 为主，KV 尽力同步" 的代码规范。
- [x] 加固 `resolveForRead` 降级链，确保 D1 异常时不中断。
- [x] 编写 `tests/unit/consistency.spec.ts` 覆盖半写、D1 宕机、数据不一致等场景。

## [x] P-B. 迁移引擎全量演练与并发竞态处理
- [x] 调整 `repoMigration.ts` 顺序：先写目标 -> 验证目标 -> 更新索引 -> 再删源。
- [x] 确保 `draining` 状态在路由的写操作中被绝对排除。
- [x] 补充实际演练记录报告 `docs/migration-dryrun-report.md`。

## [x] P-C. 事故响应手册 (Runbook)
- [x] 新建 `docs/runbook.md`，覆盖被攻击熔断、Token 泄露、GitHub 故障、误删恢复、速率耗尽、D1 不可用等场景。

## [x] P-D. 文档交叉对齐
- [x] 以 `architecture-overview.md` 为基准，全面修正 `README.md`。
- [x] 更新 README 中的技术栈 (D1, R2, Analytics)、缓存层级、API 总览及部署绑定说明。

## [x] P-E. 安全与部署细节打钩
- [x] 检查 `adminAuth.ts`，确保 `admin_session` Cookie 包含 `HttpOnly; Secure; SameSite=Strict`。
- [x] 更新 `wrangler.toml.example`，补齐 D1, R2, Analytics Engine 等绑定。
- [x] 移除 README 中误导性的 TOTP 已实现宣发（或明确标注规划中）。
- [x] 确保所有 `/admin/api/*` 响应头带有 `Cache-Control: no-store`。