# Edge Image Gateway 事故响应手册 (Runbook)

本文档列出常见的系统异常场景及其处置步骤。在发生事故时，请按对应场景的步骤操作。

---

## 场景 1: 疑似被攻击 / 写入异常，需要紧急止血

- **症状**: 写入激增、审计日志异常、Telegram 告警刷屏。
- **处置**: 开启紧急熔断 (`EMERGENCY_LOCKDOWN`)。
  - **操作**:
    1. 修改 `wrangler.toml` 或通过 Cloudflare Dashboard 设置环境变量 `EMERGENCY_LOCKDOWN=true`。
    2. 重新部署：`pnpm exec wrangler deploy --env production`。
  - **效果**: 所有写操作 (Upload, Mkdir, Delete, Migrate) 被拒，读请求不受影响。
- **恢复**: 确认威胁排除后，将 `EMERGENCY_LOCKDOWN` 设为 `false` 并重新部署。
- **验证**: 发送一个测试上传请求确认返回 200；检查 `/healthz` 的 `lockdown` 状态。

---

## 场景 2: GitHub Token 泄露

- **处置**:
  1. 在 GitHub 后台立即吊销该 Token（Settings → Developer settings → Personal access tokens）。
  2. 生成新的 Token（Classic 需 `repo` 作用域，Fine-grained 需 `Contents` 读写权限）。
  3. 更新 Worker Secret：
     - 如果是默认 Token：`pnpm exec wrangler secret put GITHUB_TOKEN --env production`。
     - 如果是仓库独立 Token：`pnpm exec wrangler secret put <SECRET_NAME> --env production`。
- **验证**: 执行一次读写测试，确认无 401/403 错误；检查 `/healthz` 里的 `githubRate` 是否恢复正常。

---

## 场景 3: 某 GitHub 仓库故障 (持续 5xx / 不可用)

- **症状**: 特定仓库的图片访问返回 5xx，`/healthz` 中该仓库 `githubRate` 异常。
- **处置**: 将该仓库状态改为 `readonly` 或 `archived`，并切换 `current_write` 到健康仓库。
  - **操作**:
    - 管理面板：仓库管理 → 编辑 → 状态改为 `readonly`。
    - 切换写路由：`POST /admin/api/repos/route/write` payload: `{"repo": "healthy-repo-id"}`。
- **验证**: 新上传确认落到健康仓库；故障仓库的读请求确认走了 R2 缓存或返回 404/降级。

---

## 场景 4: 误删文件需要恢复 (靠 Git 历史)

- **症状**: D1/KV 索引存在但物理文件被删，或索引被误删。
- **处置**:
  1. 在本地克隆对应的存储仓库。
  2. 使用 `git log --all -- <path>` 找到最后一次存在的 commit。
  3. `git checkout <commit-hash>^ -- <path>` 恢复文件。
  4. 重新上传或 push 回 GitHub。
- **恢复后**: 若索引丢失，访问一次图床触发 `backfill` 或在管理面板执行 `Sync`。
- **验证**: 文件可正常访问。

---

## 场景 5: GitHub Rate Limit 耗尽

- **症状**: `githubRate` remaining 为 0，读写大面积失败，日志出现大量 `github_rate_limit` 错误。
- **处置**:
  1. 检查是否有机迁移任务在运行，暂停 Cron 迁移任务：`pnpm exec wrangler cron set migration-resume off --env production`。
  2. 等待重置时间（GitHub API 速率限制通常每小时重置）。
  3. 如有多仓库，可临时增加更多 Token 分担负载。
- **预防**:
  - 确保 `CACHE_TTL_SECONDS` 配置合理，减少对 GitHub API 的直接请求。
  - 确保 R2 缓存 (L2) 正常工作，分担 GitHub API 读取压力。
- **验证**: `/healthz` 的 `githubRate` 恢复。

---

## 场景 6: D1 数据库不可用

- **症状**: 日志出现大量 `d1_read_failed_fallback_to_kv`。
- **处置**:
  - 系统会自动降级到 KV 镜像读取，无需人工即时干预。
  - 评估是否开启 `EMERGENCY_LOCKDOWN` 避免 KV 与 D1 产生更严重的不一致。
- **恢复**: D1 恢复后，观察日志确认读取重回 D1。如有需要，可手动对比 D1 和 KV 的 `repos` 统计信息。

---

## 场景 7: R2 缓存故障

- **症状**: 图片变体（缩放后）加载缓慢或失败，日志出现 `r2_cache_error`。
- **影响范围**: 仅影响已处理的图片变体，原始图片仍可从 GitHub 直接获取。
- **处置**:
  1. 检查 R2 Bucket 是否仍然存在且可访问：`pnpm exec wrangler r2 bucket list`。
  2. 检查 `CACHE_BUCKET` 绑定是否正确。
  3. 如 R2 短期不可用，系统会自动降级为直接从 GitHub 拉取原图，用户体验仅影响图片处理变体。
- **恢复**: R2 恢复后，后续请求会自动重新填充缓存。

---

## 场景 8: KV 命名空间故障

- **症状**: 路由失效、仓库信息读取失败、404 封禁机制异常。
- **影响范围**: 多仓库路由可能回退到默认仓库，限流和封禁可能失效。
- **处置**:
  1. 检查 KV Namespace 状态：`pnpm exec wrangler kv:namespace list`。
  2. 确认 `REPO_REGISTRY` 绑定 ID 正确。
  3. 如 KV 短期不可用，系统会回退到环境变量中的 `GITHUB_USER` / `GITHUB_REPO` 作为兜底。
- **恢复**: KV 恢复后，功能自动恢复正常。

---

## 场景 9: Cron 定时任务失败

- **症状**: 仓库容量统计长期未更新，Telegram 无告警，迁移任务停滞。
- **处置**:
  1. 检查 `wrangler.toml` 中 `[triggers]` 配置是否正确。
  2. 查看 Worker 日志：`pnpm exec wrangler tail --status error`。
  3. 手动触发一次容量同步：访问 `/admin/api/repos/:id/sync`。
- **验证**: 管理面板中仓库统计信息是否更新。

---

## 场景 10: Worker 部署失败

- **症状**: `pnpm deploy` 报错，Worker 无法更新。
- **常见原因**:
  | 错误 | 原因 | 解决方法 |
  |------|------|----------|
  | `Authentication error` | wrangler 未登录或 Token 过期 | 运行 `pnpm exec wrangler login` |
  | `KV namespace not found` | KV ID 不匹配 | 检查 `wrangler.toml` 中的 KV ID |
  | `Script size exceeded` | Worker 代码超过 3MB 限制 | 检查是否有大文件被打包，使用动态导入 |
  | `Secret not found` | 引用了未设置的 Secret | 运行 `pnpm exec wrangler secret list` 检查 |
- **回滚**: 如部署后出现问题，运行 `pnpm exec wrangler rollback` 回退到上一版本。

---

## 应急联系与资源

| 资源 | 说明 |
|------|------|
| Cloudflare Dashboard | 查看 Workers 日志、KV/D1/R2 状态、Analytics 指标 |
| GitHub Settings | 管理 Token、查看 API 用量 |
| Telegram 告警频道 | 实时接收系统告警（如已配置） |
| Sentry Dashboard | 查看错误追踪和堆栈信息（如已配置） |

---

## 场景 11: 突然出现大面积 403

- **症状**: 大量请求返回 403，但 `/healthz` 正常。
- **处置**:
  1. 检查 `ALLOWED_REFERERS` 配置是否被错误修改。
  2. 检查 `ENABLE_SIGNATURE` 是否被意外开启。
  3. 检查 `EMERGENCY_LOCKDOWN` 是否被误开启。
  4. 查看 `wrangler tail` 日志确认具体中间件拦截原因。
- **验证**: 用 `curl` 发送测试请求，逐层排查中间件。

---

## 场景 12: 管理面板无法登录

- **症状**: 访问 `/admin` 返回 401 或无限重定向。
- **处置**:
  1. **Cloudflare Access 模式**：检查 Access 应用的域名配置是否正确，策略是否包含你的邮箱。
  2. **TOTP 模式**：检查 `ADMIN_TOTP_SECRET` 是否正确设置，尝试重新生成 TOTP 密钥。
  3. 检查 `ADMIN_EMAILS` 白名单是否包含你的邮箱。
  4. 检查 `wrangler tail` 日志中 `adminAuth` 相关的错误信息。
- **临时绕过**: 在 `wrangler.toml` 中设置 `ADMIN_EMAILS` 包含你的邮箱并重新部署。

---

## 场景 13: 图片上传后访问 404

- **症状**: 上传成功返回 URL，但访问该 URL 返回 404。
- **可能原因**:
  | 原因 | 排查方法 |
  |------|----------|
  | 路径索引未写入 | 检查 D1 `paths` 表是否有该路径记录 |
  | 路由规则未匹配 | 检查 `route::read_rules` 配置 |
  | GitHub 仓库中文件不存在 | 直接在 GitHub 仓库中检查文件是否存在 |
  | 缓存了旧的 404 响应 | 通过管理面板清除缓存 |
- **处置**:
  1. 访问 `/healthz` 确认仓库状态正常。
  2. 在管理面板中执行「同步统计」。
  3. 如索引丢失，调用 `/admin/api/backfill` 回填路径索引。

---

## 场景 14: Cron 触发但未执行

- **症状**: `wrangler.toml` 中配置了 Cron，但容量统计未更新。
- **处置**:
  1. 检查 `wrangler.toml` 中 `[triggers]` 配置的 cron 表达式是否正确。
  2. 检查部署时是否使用了正确的环境（`--env production`）。
  3. 查看 Worker 日志中的 `cron` 事件：`pnpm exec wrangler tail --search cron`。
  4. 检查 Cron 触发器的状态：`pnpm exec wrangler cron list --env production`。
- **验证**: 手动触发一次同步：`POST /admin/api/repos/:id/sync`。

---

## 场景 15: 图片处理（Resize）不生效

- **症状**: 添加 `?w=200` 等参数后，图片尺寸未变化。
- **可能原因**:
  1. Cloudflare Image Resizing 未启用（需 Pro+ 订阅）。
  2. 域名未通过 Cloudflare 代理（DNS 设为 DNS Only）。
  3. 请求经过了其他 CDN 或代理层。
- **处置**:
  1. 在 Cloudflare Dashboard → Speed → Optimization 中检查 Image Resizing 是否已启用。
  2. 确认域名 DNS 的云朵图标为橙色（Proxied）。
  3. 确认请求直接到达 Workers，未被其他 CDN 拦截。
- **降级行为**: 如果 Image Resizing 不可用，Worker 会返回原始图片，不会报错。