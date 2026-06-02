# API 参考文档

## 基础信息

- **Base URL**：`https://{your-domain}`
- **健康检查**：`GET /healthz`（无需认证）
- **管理后台**：`/admin/*`（需管理员认证）
- **图片请求**：`GET /*`（受安全中间件保护）

---

## 图片请求

### 获取图片

```
GET /{path}
```

获取存储在 GitHub 仓库中的图片文件。

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 图片在仓库中的路径，如 `2026/06/photo.png` |

**查询参数**（可选，用于动态缩放）：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `w` | number | - | 目标宽度（像素） |
| `h` | number | - | 目标高度（像素） |
| `q` | number | `75` | 图片质量（1-100） |
| `fit` | string | `scale-down` | 缩放模式：`cover`、`contain`、`scale-down` |
| `sig` | string | - | HMAC 签名（需要签名时必填） |
| `exp` | number | - | 签名过期时间戳（unix 秒级） |

**示例**：

```http
GET /2026/06/hero.jpg?w=1200&q=80&fit=cover
```

**响应**：
- `200 OK`：图片内容（Content-Type 自动匹配）
- `304 Not Modified`：ETag 匹配时返回
- `403 Forbidden`：防盗链、限流或签名验证失败
- `404 Not Found`：文件不存在
- `429 Too Many Requests`：请求频率超限

**响应头**：

| 响应头 | 说明 |
|--------|------|
| `Cache-Control` | `public, max-age={CACHE_TTL_SECONDS}` |
| `CF-Cache-Status` | 缓存状态（HIT/MISS） |
| `X-Repo-Route` | 路由到的仓库 ID |

---

## 健康检查

### 服务状态

```
GET /healthz
```

检查服务运行状态和环境配置。

**响应示例**（200）：

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "config": {
    "githubUser": "***",
    "githubRepo": "***",
    "githubBranch": "main",
    "allowedReferers": [],
    "cacheTtlSeconds": 604800,
    "enableSignature": false,
    "emergencyLockdown": false,
    "rateLimitPerMin": 120
  }
}
```

**响应头**：无安全中间件干预。

---

## 管理后台 API

所有管理后台 API 都需要通过 Cloudflare Access 认证。

### 文件管理

#### 列出文件

```
GET /admin/api/files?repo={repoId}&path={path}
```

获取指定目录下的文件列表。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `repo` | string | 否 | 当前写仓库 | 仓库 ID |
| `path` | string | 否 | `/` | 目录路径 |

**响应**：

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "name": "photo.jpg",
        "path": "2026/photo.jpg",
        "sha": "abc123",
        "size": 123456,
        "type": "file",
        "download_url": "https://raw.githubusercontent.com/..."
      }
    ],
    "directories": ["2026"],
    "repo": "default-repo"
  }
}
```

#### 上传文件

```
POST /admin/api/upload
Content-Type: multipart/form-data
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 要上传的文件 |
| `path` | string | 是 | 存储路径（含文件名） |
| `repo` | string | 否 | 目标仓库 ID（默认当前写仓库） |

**响应**：

```json
{
  "success": true,
  "data": {
    "url": "/2026/photo.jpg",
    "sha": "def456"
  }
}
```

#### 删除文件

```
DELETE /admin/api/files
Content-Type: application/json
```

```json
{
  "path": "2026/old-photo.jpg",
  "repo": "default-repo"
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "sha": "ghi789"
  }
}
```

**批量删除**：

```http
POST /admin/api/files/batch-delete
Content-Type: application/json
```

```json
{
  "paths": [
    { "path": "2026/photo1.jpg" },
    { "path": "2026/photo2.jpg" }
  ],
  "repo": "default-repo"
}
```

#### 移动文件

```
POST /admin/api/files/move
Content-Type: application/json
```

```json
{
  "from": "2026/temp.jpg",
  "to": "archive/temp.jpg",
  "repo": "default-repo"
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "sha": "jkl012"
  }
}
```

#### 创建目录

```
POST /admin/api/files/mkdir
Content-Type: application/json
```

```json
{
  "path": "new-folder",
  "repo": "default-repo"
}
```

---

### 仓库管理

#### 列出所有仓库

```
GET /admin/api/repos
```

**响应**：

```json
{
  "success": true,
  "data": {
    "repos": [
      {
        "id": "default-repo",
        "owner": "github-user",
        "name": "storage-repo",
        "branch": "main",
        "status": "active",
        "sizeBytes": 1048576,
        "fileCount": 42,
        "capacityLimitBytes": 5368709120,
        "readRule": { "prefix": "/" }
      }
    ],
    "currentWriteRepo": "default-repo"
  }
```

#### 注册仓库

```
POST /admin/api/repos
Content-Type: application/json
```

```json
{
  "id": "new-repo",
  "owner": "github-user",
  "name": "another-repo",
  "branch": "main",
  "readRule": { "prefix": "/photos" },
  "status": "active",
  "capacityLimitBytes": 10737418240
}
```

#### 更新仓库

```
PATCH /admin/api/repos/{repoId}
Content-Type: application/json
```

```json
{
  "status": "readonly",
  "capacityLimitBytes": 21474836480
}
```

#### 删除仓库

```
DELETE /admin/api/repos/{repoId}
```

#### 切换写仓库

```
POST /admin/api/repos/route/write
Content-Type: application/json
```

```json
{
  "repo": "target-repo-id"
}
```

---

### 统计与缓存

#### 获取统计信息

```
GET /admin/api/stats
```

**响应**：

```json
{
  "success": true,
  "data": {
    "totalRepos": 2,
    "totalFiles": 142,
    "totalSizeBytes": 52428800,
    "repos": [
      {
        "id": "default-repo",
        "name": "storage-repo",
        "fileCount": 100,
        "sizeBytes": 41943040,
        "capacityLimitBytes": 5368709120
      },
      {
        "id": "blog-repo",
        "name": "blog-images",
        "fileCount": 42,
        "sizeBytes": 10485760,
        "capacityLimitBytes": 10737418240
      }
    ]
  }
}
```

#### 刷新缓存

```
POST /admin/api/stats/cache/purge
```

**响应**：

```json
{
  "success": true,
  "message": "Cache purged"
}
```

---

## 签名生成脚本

使用内置脚本生成带签名的 URL：

```bash
npx tsx scripts/sign.ts <path> <expires_in_seconds> <secret>
```

**示例**：

```bash
npx tsx scripts/sign.ts /private/documents/report.pdf 3600 your-sign-secret
```

**输出**：

```
http://localhost:8787/private/documents/report.pdf?sig=abc123def456&exp=1704067200
```

---

## 状态码汇总

| 状态码 | 说明 | 触发条件 |
|--------|------|----------|
| `200` | 成功 | 请求正常处理 |
| `304` | 未修改 | 客户端缓存有效 |
| `400` | 请求错误 | 参数无效或路径非法 |
| `403` | 禁止访问 | 防盗链/签名验证失败、IP 封禁 |
| `404` | 未找到 | 文件或仓库不存在 |
| `429` | 请求过多 | 超出速率限制 |
| `500` | 服务器错误 | 内部处理异常 |

---

## 相关文档

- [安全指南](./security.md) — 签名验证和防盗链的工作原理
- [多仓库路由](./multi-repo.md) — 多仓库 API 的管理和使用
- [管理后台指南](./admin-panel.md) — 管理后台前端操作说明
- [架构详解](./architecture.md) — 完整的请求处理流程