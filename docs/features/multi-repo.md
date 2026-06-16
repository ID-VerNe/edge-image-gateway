# 多仓库管理

## 概述

Edge Image Gateway 支持将多个 GitHub 仓库作为存储后端，实现存储空间的水平扩展。系统自动在仓库间路由读写请求，支持按容量和路径规则灵活配置。

## 核心概念

### 仓库注册表

仓库注册表存储在 Cloudflare D1 中（repos 表），每条记录对应一个仓库的 `RepoMeta` 对象：

```sql
-- repos 表结构
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','readonly','draining','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  capacity_limit_bytes INTEGER NOT NULL DEFAULT 5368709120,
  token_secret_name TEXT NOT NULL DEFAULT 'GITHUB_TOKEN',
  routes TEXT NOT NULL DEFAULT '[]'
);
```

```sql
-- 查询所有活跃仓库
SELECT * FROM repos WHERE status = 'active';

-- 按 ID 查询仓库
SELECT * FROM repos WHERE id = 'repo-main';
```

### 仓库状态

| 状态 | 读 | 写 | 说明 |
|------|----|----|------|
| `active` | ✓ | ✓ | 正常读写，参与自动写路由 |
| `readonly` | ✓ | ✗ | 仅可读取，适用于归档旧数据 |
| `draining` | ✓ | ✗ | 迁移中，可读不可写，可删除 |
| `archived` | ✗ | ✗ | 已归档，不出现在路由选择中 |

### 写路由

系统使用 **当前写仓库** 的概念，所有上传操作都发送到唯一一个活跃仓库。写路由逻辑：

1. 从 D1 读取当前写仓库记录（通过 `repoRouter.ts` 中的 `getCurrentWriteRepo()` 查询 `repos` 表）
2. 检查该仓库状态是否为 `active`
3. 如果仓库不可写（状态变更、容量满等），自动切换到下一个可用仓库
4. 所有仓库均不可写时，返回 `503 Service Unavailable`

**写仓库切换条件：**

| 条件 | 行为 |
|------|------|
| 仓库状态变更（非 active） | 自动切换到下一个 active 仓库 |
| 容量达到硬限制（100%） | 自动切换，原仓库转为 readonly |
| 容量达到软限制（90%） | 发送告警，仍可继续写入 |
| 管理员手动切换 | 通过管理面板设置新的写目标 |

### 读路由

读操作支持按路径前缀路由到不同仓库：

1. 先查 D1 `paths` 表中 `path::{path}` 精确路径索引
2. 如未命中，检查 KV `route::read_rules` 中的前缀规则（KV 仅用于读路由规则缓存，非持久存储）
3. 都未匹配时，使用当前写仓库来读取

读路由规则示例：

```json
[
  { "prefix": "/blog", "repo": "repo-blog" },
  { "prefix": "/photos/2024", "repo": "repo-photos-2024" },
  { "prefix": "/photos/2025", "repo": "repo-photos-2025" }
]
```

---

## 配置多仓库

### 通过管理面板

1. 登录管理面板 → 仓库管理
2. 点击"添加仓库"
3. 填写仓库信息：
   - 仓库 ID（唯一标识，如 `repo-blog`）
   - GitHub 所有者
   - 仓库名称
   - 分支（通常为 `main`）
   - 容量上限（字节）
   - Token（选择已有的 Secret 名称或添加新 Token）
4. 保存后仓库自动注册到 D1

### 通过 D1 直接操作

```bash
# 添加仓库
npx wrangler d1 execute DB --env production \
  --command="INSERT INTO repos (id, owner, name, branch, status, capacity_limit_bytes, token_secret_name) VALUES ('repo-blog', 'my-org', 'blog-images', 'main', 'active', 1073741824, 'GITHUB_TOKEN_BLOG');"

# 设置读路由规则（更新仓库的 routes 字段）
npx wrangler d1 execute DB --env production \
  --command="UPDATE repos SET routes = '[{\"prefix\":\"/blog\",\"repo\":\"repo-blog\"}]' WHERE id = 'repo-blog';"

# 查看所有仓库
npx wrangler d1 execute DB --env production \
  --command="SELECT id, owner, name, status, size_bytes, file_count FROM repos;"

# 切换写仓库（通过标记字段 current_write 的表或写入 route_config 表）
# 系统通过查询 route_config 表确定当前写仓库
npx wrangler d1 execute DB --env production \
  --command="INSERT OR REPLACE INTO route_config (key, value) VALUES ('current_write', 'repo-main');"
```

---

## 容量管理

### 自动容量检查

系统的容量数据存储在 D1 `repos` 表的 `size_bytes` 和 `file_count` 字段中。上传后通过 `UPDATE repos SET size_bytes = ?, file_count = ? WHERE id = ?` 自动更新：

```sql
-- 查看仓库容量
SELECT id, size_bytes, file_count, capacity_limit_bytes,
       ROUND(CAST(size_bytes AS REAL) / capacity_limit_bytes * 100, 2) AS usage_pct
FROM repos WHERE id = 'repo-main';
```

当仓库容量接近上限时，系统会：

1. 记录警告日志
2. 如果启用了 Telegram 告警，发送通知
3. 写路由自动避开容量已满的仓库

### 容量超限处理

| 级别 | 阈值 | 行为 |
|------|------|------|
| 正常 | < 80% | 正常写入 |
| 警告 | 80% - 90% | 日志警告 |
| 软限制 | 90% - 100% | 发送 Telegram 告警，仍可写入 |
| 硬限制 | 100% | 自动切换写仓库，原仓库转为 `readonly` |

超限后需手动扩容（增加容量上限）或迁移数据后才可继续写入。

---

## 路径索引

### D1 主索引 + KV 缓存

路径索引以 D1 为主存储，KV 作为边缘缓存加速：

1. 文件上传后自动在 D1 `paths` 表中记录路径 → 仓库映射
2. 写入 D1 后将热点路径同步到 KV，用于后续边缘路由加速
3. 直接从 GitHub API 获取的请求不会回填路径索引
4. 读请求优先查询 D1，未命中时查 KV 缓存，两者均未命中则按路由规则处理

### 索引格式

D1 `paths` 表结构：

```sql
CREATE TABLE paths (
  path TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  sha TEXT,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);
```

KV 缓存（仅用于读加速）：

```
键: path:/blog/2025/photo.jpg
值: {"repo":"repo-blog"}
```

---

## 仓库迁移

### 迁移流程

将数据从仓库 A 迁移到仓库 B：

1. 将仓库 A 设置为 `draining` 状态
2. 将仓库 B 设置为当前写仓库
3. 手动将仓库 A 的文件复制到仓库 B（GitHub API / git clone）
4. 更新路径索引指向仓库 B
5. 确认迁移完成后，将仓库 A 设为 `archived` 或删除

### 迁移命令示例

```bash
# 1. 将仓库 A 设为 draining
npx wrangler d1 execute DB --env production \
  --command="UPDATE repos SET status = 'draining' WHERE id = 'repo-old';"

# 2. 添加仓库 B 并设为写目标
npx wrangler d1 execute DB --env production \
  --command="INSERT INTO repos (id, owner, name, branch, status, capacity_limit_bytes, token_secret_name) VALUES ('repo-new', 'my-org', 'repo-new', 'main', 'active', 5368709120, 'GITHUB_TOKEN');"

npx wrangler d1 execute DB --env production \
  --command="INSERT OR REPLACE INTO route_config (key, value) VALUES ('current_write', 'repo-new');"

# 3. 用 git 迁移文件
git clone https://github.com/<owner>/repo-old.git
git clone https://github.com/<owner>/repo-new.git

# 将旧仓库文件复制到新仓库（Windows 用 xcopy /E，macOS/Linux 用 cp -r）
xcopy /E /I repo-old\* repo-new\
# 或: cp -r repo-old/* repo-new/

cd repo-new && git add . && git commit -m "migrate files from old repo" && git push

# 4. 更新路径索引指向新仓库
npx wrangler d1 execute DB --env production \
  --command="UPDATE paths SET repo_id = 'repo-new' WHERE repo_id = 'repo-old';"

# 5. 完成迁移后删除旧仓库
npx wrangler d1 execute DB --env production \
  --command="DELETE FROM repos WHERE id = 'repo-old';"
```

### 注意事项

- 迁移期间，仓库 A 的文件仍可正常读取
- 新建文件写入仓库 B
- 建议在低流量时段进行大规模迁移
- 迁移完成后需更新路径索引

### 自动化迁移（推荐）

系统内置了跨仓库迁移引擎（[src/services/repoMigration.ts](../src/services/repoMigration.ts)），支持通过管理面板或 API 发起自动化迁移：

**通过管理面板：**

1. 进入仓库管理页面
2. 选择源仓库，点击「迁移」
3. 选择目标仓库，确认迁移
4. 系统自动执行：枚举文件 → 逐文件复制 → 更新索引 → 删除源文件
5. 迁移进度可在管理面板实时查看

**通过 API：**

```bash
# 启动迁移
curl -X POST https://{你的域名}/admin/api/repos/{source_repo_id}/migrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"targetRepoId": "repo-new"}'

# 查看迁移状态
curl https://{你的域名}/admin/api/repos/migrations/{jobId} \
  -H "Authorization: Bearer <token>"

# 恢复暂停的迁移
curl -X POST https://{你的域名}/admin/api/repos/migrations/{jobId}/resume \
  -H "Authorization: Bearer <token>"
```

**自动化迁移特性：**

| 特性 | 说明 |
|------|------|
| 断点续传 | 遇到 API 速率限制时自动暂停，下次 Cron 触发时恢复 |
| 完整性校验 | 每个文件迁移后验证 SHA 哈希一致 |
| 原子更新 | 索引更新在文件迁移成功后原子执行 |
| 状态追踪 | 完整记录迁移进度、已处理文件数、失败文件列表 |
| 回滚支持 | 迁移失败时自动保留源文件，支持手动回滚 |

**迁移状态机：**

```
pending → running → completed
                ↘ paused → running (resume)
                ↘ failed  → running (retry)
```

### 手动迁移（Git 方式）

适用于需要自定义迁移逻辑或大规模数据搬移的场景：

---

## 多 Token 管理

每个仓库可以使用独立的 GitHub Token，Token 元数据存储在 D1 `auth_tokens` 表中：

- **共享 Token** — 多个仓库使用同一个 Secret，适用于个人场景
- **独立 Token** — 每个仓库使用独立的 Secret，适用于团队场景，可以分别控制权限

Token 通过 `tokenSecretName` 字段引用环境变量 Secret 的名称：

```json
{
  "id": "repo-special",
  "tokenSecretName": "GITHUB_TOKEN_SPECIAL"
}
```

对应的 Secret 通过 `wrangler secret put` 设置：

```bash
npx wrangler secret put GITHUB_TOKEN_SPECIAL
```

---

## 最佳实践

### 仓库规划策略

| 场景 | 推荐配置 |
|------|----------|
| 个人博客 | 1 个仓库，5GB 容量 |
| 小型团队 | 2-3 个仓库，按年或月份划分 |
| 大型项目 | 多个仓库，按项目/时间/类型分类 |
| 多站点 | 每个站点独立仓库，通过路由规则隔离 |

### 仓库命名规范

推荐使用层级命名，便于管理：

```
repo-blog              → 博客图片
repo-blog-2025         → 博客图片（2025）
repo-photos            → 照片
repo-uploads           → 通用上传
repo-archived          → 已归档数据（draining 状态）
```

### 容量规划

- 单仓库建议不超过 5GB（GitHub API 性能和 D1 读写效率的平衡点）
- 10GB 以上建议拆分到多个仓库
- 预留 20% 的容量缓冲空间
- 定期检查各仓库容量，提前扩容

### 多仓库监控

| 监控项 | 说明 |
|--------|------|
| 容量使用率 | 关注各仓库的容量使用率和增长率 |
| 状态变更 | 仓库自动转为 readonly 时需关注 |
| 路由规则 | 定期审查读路由规则的准确性 |
| API 用量 | 监控 GitHub API 使用量，避免超限 |

### 常见问题

**Q: 如何将特定路径的文件路由到指定仓库？**
A: 通过管理面板或 D1 设置仓库的 `routes` 字段，添加前缀匹配规则。

**Q: 写仓库切换后，旧仓库的文件还能访问吗？**
A: 可以。读路由按路径索引和规则匹配，旧仓库文件仍可正常读取。

**Q: 可以同时向多个仓库写入吗？**
A: 不支持。系统始终只有一个"当前写仓库"，所有上传都写入同一个仓库。如需多仓库写入，需手动切换写目标。

**Q: 仓库容量上限如何设置？**
A: 创建仓库时设置 `capacity_limit_bytes`，单位为字节。例如 5GB = `5368709120`。

---

## 延伸阅读

- [架构总览](../architecture/overview.md) — 多仓库路由引擎的完整架构
- [架构说明](../architecture/details.md) — 读取/写入路由的详细数据流
- [文档导航](../index.md) — 所有文档的快速索引