# 多仓库路由配置

## 概述

多仓库路由功能允许将图片存储分布在多个 GitHub 仓库中，通过路径前缀实现智能路由。这对于需要超大规模存储、分项目隔离或逐步迁移的场景非常有用。

---

## 工作原理

### 核心组件

多仓库路由基于 [Cloudflare KV](../docs/configuration.md#kv-命名空间) 存储实现，由 [repoRouter.ts](../src/services/repoRouter.ts) 管理。

```
                 ┌───────────────────────┐
                 │    用户请求路径          │
                 │  /blog/image.png       │
                 └──────────┬────────────┘
                            │
                            ▼
                 ┌───────────────────────┐
                 │    多仓库路由解析        │
                 │  repoRouter.lookup()   │
                 └──────────┬────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                  ▼
   ┌────────────┐   ┌────────────┐   ┌────────────┐
   │ 仓库 A     │   │ 仓库 B     │   │ 默认仓库   │
   │ /blog/*    │   │ /photos/*  │   │ (无前缀)   │
   └────────────┘   └────────────┘   └────────────┘
```

### 路由规则（ReadRule）

每个仓库可以配置一个路径前缀。当请求到达时，按注册顺序匹配第一个前缀匹配的仓库：

```typescript
// 路由规则示例
ReadRule: [
  { prefix: "/blog", repoId: "repo-blog" },
  { prefix: "/photos", repoId: "repo-photos" },
  // 无前缀的匹配默认仓库
]
```

### 写路由

上传操作指向当前写仓库（`route::current_write`）。可以在管理后台或 API 中切换写仓库。

---

## 配置步骤

### 1. 准备多个 GitHub 仓库

为每个项目或用途创建一个私有仓库：
- `blog-images`：博客图片
- `photo-storage`：照片存储
- `misc-files`：其他文件

### 2. 注册仓库

通过管理后台 API 注册：

```http
POST /admin/api/repos
Content-Type: application/json

{
  "id": "blog-repo",
  "owner": "github-user",
  "name": "blog-images",
  "branch": "main",
  "readRule": { "prefix": "/blog" },
  "status": "active"
}
```

```http
POST /admin/api/repos
Content-Type: application/json

{
  "id": "photo-repo",
  "owner": "github-user",
  "name": "photo-storage",
  "branch": "main",
  "readRule": { "prefix": "/photos" },
  "status": "active"
}
```

### 3. 设置默认仓库

配置无前缀匹配的仓库作为兜底：

```http
POST /admin/api/repos
Content-Type: application/json

{
  "id": "default-repo",
  "owner": "github-user",
  "name": "misc-files",
  "branch": "main",
  "status": "active"
}
```

---

## 仓库状态管理

| 状态 | 说明 | 读取行为 | 写入行为 |
|------|------|----------|----------|
| `active` | 正常状态 | 正常响应 | 允许写入 |
| `readonly` | 只读模式 | 正常响应 | **拒绝写入**，返回 403 |
| `draining` | 正在排空 | 正常响应 | **拒绝写入**，仅用于旧数据迁移 |
| `archived` | 归档 | **拒绝请求** | 拒绝写入 |

### 更新仓库状态

```http
PATCH /admin/api/repos/{repoId}
Content-Type: application/json

{
  "status": "readonly"
}
```

---

## 容量管理

### 自动同步

系统通过定时任务（Cron Trigger）自动同步所有注册仓库的容量信息：

```typescript
// 每 60 分钟执行一次
cron: "0 * * * *"
```

同步内容包括：
- 仓库总大小（bytes）
- 文件数量
- 最后同步时间

### 容量限制

每个仓库可设置容量上限，超出后自动阻止上传：

```http
PATCH /admin/api/repos/{repoId}
Content-Type: application/json

{
  "capacityLimitBytes": 10737418240  // 10GB
}
```

---

## 迁移场景

### 存储迁移

当需要从一个仓库迁移到另一个仓库时：

1. **准备新仓库**：创建并注册新仓库
2. **切换写仓库**：将写路由切换到新仓库
3. **旧仓库设为 draining**：新文件写入新仓库，旧文件仍然可读
4. **迁移数据**：手动将旧仓库文件复制到新仓库
5. **归档旧仓库**：迁移完成后归档旧仓库

### 多项目隔离

```typescript
// 不同项目使用不同仓库
readRules = [
  { prefix: "/project-a", repoId: "proj-a-storage" },
  { prefix: "/project-b", repoId: "proj-b-storage" },
  { prefix: "/project-c", repoId: "proj-c-storage" },
]
```

---

## 调试与监控

### 检查路由

请求经过路由时，响应头中会包含路由信息：

```http
X-Repo-Route: blog-repo
```

### KV 数据查看

可通过 Wrangler 查看 KV 中的路由数据：

```bash
npx wrangler kv key get REPO_REGISTRY --binding route::current_write
npx wrangler kv key get REPO_REGISTRY --binding repo::blog-repo
```

### 30 秒内存缓存

路由查询结果会在 Worker 内存中缓存 30 秒，避免频繁读取 KV 导致性能下降：

```typescript
// repoRouter.ts 中的缓存逻辑
private cache: Map<string, { data: any; expiry: number }>;
private readonly CACHE_TTL_MS = 30_000;
```

---

## 注意事项

1. **KV 计费**：KV 读取按次数计费，内存缓存可有效降低成本
2. **路由顺序**：路由规则按注册顺序匹配，需要更精确的规则放在前面
3. **Token 管理**：每个仓库可以指定不同的 `tokenSecretName`，使用不同的 GitHub Token
4. **写仓库唯一性**：任何时候只有一个写仓库处于活跃状态
5. **路径冲突**：确保路由前缀不重叠，否则先注册的规则生效