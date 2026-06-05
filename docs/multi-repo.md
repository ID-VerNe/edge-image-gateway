# 多仓库管理

## 概述

Edge Image Gateway 支持将多个 GitHub 仓库作为存储后端，实现存储空间的水平扩展。系统自动在仓库间路由读写请求，支持按容量和路径规则灵活配置。

## 核心概念

### 仓库注册表

仓库注册表存储在 Cloudflare KV 中，每个仓库对应一个 `repo::{id}` 键，值为 `RepoMeta` 对象：

```json
{
  "id": "repo-main",
  "owner": "my-org",
  "name": "image-hosting-1",
  "branch": "main",
  "status": "active",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "sizeBytes": 1048576,
  "fileCount": 42,
  "capacityLimitBytes": 5368709120,
  "tokenSecretName": "GITHUB_TOKEN",
  "routes": []
}
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

1. 从 KV 读取 `route::current_write` 获取当前写仓库 ID
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

1. 先查 `path::{path}` 精确路径索引
2. 匹配 `route::read_rules` 中的前缀规则
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
4. 保存后仓库自动注册到 KV

### 通过 KV 直接操作

```bash
# 添加仓库
npx wrangler kv:key put \
  --binding=REPO_REGISTRY \
  "repo::repo-blog" \
  '{"id":"repo-blog","owner":"my-org","name":"blog-images","branch":"main","status":"active","createdAt":"2025-06-01T00:00:00.000Z","sizeBytes":0,"fileCount":0,"capacityLimitBytes":1073741824,"tokenSecretName":"GITHUB_TOKEN_BLOG"}'

# 设置读路由规则
npx wrangler kv:key put \
  --binding=REPO_REGISTRY \
  "route::read_rules" \
  '[{"prefix":"/blog","repo":"repo-blog"}]'

# 切换写仓库
npx wrangler kv:key put \
  --binding=REPO_REGISTRY \
  "route::current_write" "repo-main"
```

---

## 容量管理

### 自动容量检查

系统在上传后自动更新仓库容量和文件计数：

```json
{
  "sizeBytes": 2147483648,
  "fileCount": 892,
  "capacityLimitBytes": 5368709120
}
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

### 懒加载索引

路径索引采用懒加载策略：

1. 文件上传后自动在 KV 中记录 `path::{path}` → `{ repoId, sha, size }`
2. 上传后仓库 KV 中的路径索引会保留，用于后续路由加速
3. 直接从 GitHub API 获取的请求不会回填路径索引

### 索引格式

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
npx wrangler kv:key put --binding=REPO_REGISTRY \
  "repo::repo-old" '{"id":"repo-old","status":"draining",...}'

# 2. 添加仓库 B 并设为写目标
npx wrangler kv:key put --binding=REPO_REGISTRY \
  "repo::repo-new" '{"id":"repo-new","status":"active",...}'

npx wrangler kv:key put --binding=REPO_REGISTRY \
  "route::current_write" "repo-new"

# 3. 用 git 迁移文件
git clone https://github.com/<owner>/repo-old.git
git clone https://github.com/<owner>/repo-new.git

# 将旧仓库文件复制到新仓库（Windows 用 xcopy /E，macOS/Linux 用 cp -r）
xcopy /E /I repo-old\* repo-new\
# 或: cp -r repo-old/* repo-new/

cd repo-new && git add . && git commit -m "migrate files from old repo" && git push

# 4. 完成迁移后删除旧仓库
npx wrangler kv:key delete --binding=REPO_REGISTRY "repo::repo-old"
```

### 注意事项

- 迁移期间，仓库 A 的文件仍可正常读取
- 新建文件写入仓库 B
- 建议在低流量时段进行大规模迁移
- 迁移完成后需更新路径索引

---

## 多 Token 管理

每个仓库可以使用独立的 GitHub Token：

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

- 单仓库建议不超过 5GB（GitHub API 性能和 KV 读写效率的平衡点）
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
A: 通过管理面板或 KV 设置 `route::read_rules`，添加前缀匹配规则。

**Q: 写仓库切换后，旧仓库的文件还能访问吗？**
A: 可以。读路由按路径索引和规则匹配，旧仓库文件仍可正常读取。

**Q: 可以同时向多个仓库写入吗？**
A: 不支持。系统始终只有一个"当前写仓库"，所有上传都写入同一个仓库。如需多仓库写入，需手动切换写目标。

**Q: 仓库容量上限如何设置？**
A: 创建仓库时设置 `capacityLimitBytes`，单位为字节。例如 5GB = `5368709120`。