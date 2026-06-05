# Edge Image Gateway 事故响应手册 (Runbook)

## 场景 1: 疑似被攻击 / 写入异常，需要紧急止血
- **症状**: 写入激增、审计日志异常、Telegram 告警刷屏。
- **处置**: 开启紧急熔断 (EMERGENCY_LOCKDOWN)。
  - **操作**: 
    1. 修改 `wrangler.toml` 或通过 Dashboard 设置环境变量 `EMERGENCY_LOCKDOWN=true`。
    2. 重新部署：`pnpm exec wrangler deploy --env production`。
  - **效果**: 所有写操作 (Upload, Mkdir, Delete, Migrate) 被拒，读请求不受影响。
- **恢复**: 确认威胁排除后，将 `EMERGENCY_LOCKDOWN` 设为 `false` 并重新部署。
- **验证**: 发送一个测试上传请求确认返回 200；检查 `/healthz` 的 `lockdown` 状态。

## 场景 2: GitHub Token 泄露
- **处置**: 
  1. 在 GitHub 后台立即吊销该 Token。
  2. 生成新的 Classic Token (需 `repo` 作用域)。
  3. 更新 Worker Secret：
     - 如果是默认 Token：`pnpm exec wrangler secret put GITHUB_TOKEN --env production`。
     - 如果是仓库独立 Token：`pnpm exec wrangler secret put <SECRET_NAME> --env production`。
- **验证**: 执行一次读写测试，确认无 401/403 错误；检查 `/admin/api/stats` 里的 `github_rate` 是否恢复正常。

## 场景 3: 某 GitHub 仓库故障 (持续 5xx / 不可用)
- **处置**: 将该仓库状态改为 `readonly` 或 `archived`，并切换 `current_write` 到健康仓库。
  - **操作**: 
    - 管理面板：仓库管理 -> 编辑 -> 状态改为 `readonly`。
    - 切换写路由：`POST /admin/api/repos/route/write` payload: `{"repo": "healthy-repo-id"}`。
- **验证**: 新上传确认落到健康仓库；故障仓库的读请求确认走了 R2 缓存或返回 404/降级。

## 场景 4: 误删文件需要恢复 (靠 Git 历史)
- **症状**: D1/KV 索引存在但物理文件被删，或索引被误删。
- **处置**: 
  1. 在本地克隆对应的存储仓库。
  2. 使用 `git log --all -- <path>` 找到最后一次存在的 commit。
  3. `git checkout <commit-hash>^ -- <path>` 恢复文件。
  4. 重新上传或 push 回 GitHub。
- **恢复后**: 若索引丢失，访问一次图床触发 `backfill` 或在管理面板执行 `Sync`。
- **验证**: 文件可正常访问。

## 场景 5: GitHub Rate Limit 耗尽
- **症状**: `github_rate` remaining 为 0，读写大面积失败。
- **处置**: 
  1. 临时增加更多 Token 分担负载。
  2. 暂停 Cron 自动迁移任务：`pnpm exec wrangler cron set migration-resume off --env production`。
  3. 等待重置时间。
- **验证**: `/healthz` 的 `githubRate` 恢复。

## 场景 6: D1 数据库不可用
- **症状**: 日志出现大量 `d1_read_failed_fallback_to_kv`。
- **处置**: 
  - 系统会自动降级到 KV 镜像读取，无需人工即时干预。
  - 评估是否开启 `EMERGENCY_LOCKDOWN` 避免 KV 与 D1 产生更严重的不一致。
- **恢复**: D1 恢复后，观察日志确认读取重回 D1。如有需要，可手动对比 D1 和 KV 的 `repos` 统计信息。
