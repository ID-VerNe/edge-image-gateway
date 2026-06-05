# API 参考

## 概览

所有 API 端点托管在 Cloudflare Workers 上。基础 URL 格式：

```
https://{你的域名}
```

---

## 图片访问

### 获取图片

```
GET /{path}
```

获取图片或其它文件的原始内容。

**路径参数**

| 参数 | 说明 |
|------|------|
| `path` | 文件在 GitHub 仓库中的路径，支持多级目录 |

**查询参数（图片处理）**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `w` | number | 原图宽度 | 缩放宽度（像素） |
| `h` | number | 原图高度 | 缩放高度（像素） |
| `q` | number | `85` | 图片质量（1-100） |
| `fit` | string | `scale-down` | 缩放模式：`scale-down` / `contain` / `cover` / `crop` / `pad` |
| `format` | string | 原格式 | 输出格式：`auto` / `avif` / `webp` / `json` |

> 图片处理依赖 Cloudflare Image Resizing，需要相应订阅。

**响应**

| 状态码 | 说明 |
|--------|------|
| `200 OK` | 图片内容，包含适当的 `Content-Type` 和缓存头 |
| `304 Not Modified` | 客户端缓存有效（支持 `If-None-Match` / `If-Modified-Since`） |
| `403 Forbidden` | 防盗链拦截或签名无效 |
| `404 Not Found` | 文件不存在 |
| `429 Too Many Requests` | 速率超限 |

**示例**

```bash
# 获取原图
curl https://image.example.com/images/photo.jpg

# 获取 200x200 缩略图
curl https://image.example.com/images/photo.jpg?w=200&h=200

# 获取 WebP 格式
curl https://image.example.com/images/photo.jpg?format=webp

# 裁剪 + 高质量
curl "https://image.example.com/images/photo.jpg?w=400&h=400&fit=crop&q=90"
```

### 目录列表

```
GET /{path}?list
```

列出指定路径下的文件和子目录。

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `list` | boolean | 启用目录列表模式 |
| `depth` | number | 递归深度（默认 `1`，最大 `3`） |

**响应**

```json
{
  "path": "/images",
  "type": "tree",
  "entries": [
    { "name": "2025", "path": "/images/2025", "type": "tree" },
    { "name": "photo.jpg", "path": "/images/photo.jpg", "type": "blob", "size": 102400 }
  ]
}
```

---

## 上传图片

### 上传文件

```
POST /upload
```

上传图片文件到默认写仓库。

**请求头**

| 头 | 值 | 必填 | 说明 |
|----|----|------|------|
| `Content-Type` | `multipart/form-data` | 是 | 仅支持 multipart 上传 |
| `X-Signature` | HMAC-SHA256 | 当 `ENABLE_SIGNATURE=true` 时 | 请求签名 |
| `X-Timestamp` | Unix 时间戳 | 当需签名时 | 请求时间戳 |

**请求体（multipart/form-data）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 要上传的文件 |
| `path` | string | 否 | 自定义存储路径（含文件名） |
| `prefix` | string | 否 | 路径前缀，自动与文件名拼接 |

**成功响应**

```json
{
  "success": true,
  "url": "/images/2025/photo.jpg",
  "sha": "abc123def456",
  "size": 102400,
  "repo": "my-image-repo"
}
```

**错误响应**

```json
{
  "success": false,
  "error": "File size exceeds limit",
  "code": "FILE_TOO_LARGE"
}
```

**错误码**

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `FILE_TOO_LARGE` | 413 | 文件超出大小限制 |
| `INVALID_TYPE` | 415 | 不允许的文件类型 |
| `SIGNATURE_REQUIRED` | 401 | 需要签名认证 |
| `INVALID_SIGNATURE` | 403 | 签名验证失败 |
| `UPLOAD_FAILED` | 500 | 上传到 GitHub 失败 |
| `EMERGENCY_LOCKDOWN` | 503 | 系统已熔断，拒绝写入 |

**示例**

```bash
# 简单上传
curl -X POST \
  -F "file=@photo.jpg" \
  https://image.example.com/upload

# 带自定义路径
curl -X POST \
  -F "file=@photo.jpg" \
  -F "path=blog/2025/photo.jpg" \
  https://image.example.com/upload

# 带签名认证
curl -X POST \
  -F "file=@photo.jpg" \
  -H "X-Signature: <hmac-hex>" \
  -H "X-Timestamp: 1717200000" \
  https://image.example.com/upload
```

### 批量上传

```
POST /upload/batch
```

一次性上传多个文件。

**请求体（multipart/form-data）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `files` | File[] | 多个文件（使用相同的字段名 `files`） |

**响应**

```json
{
  "success": true,
  "results": [
    { "url": "/photo1.jpg", "sha": "abc...", "size": 102400, "repo": "repo1" },
    { "url": "/photo2.jpg", "sha": "def...", "size": 204800, "repo": "repo1" }
  ],
  "errors": []
}
```

---

## 图片删除

### 删除文件

```
DELETE /{path}
```

从存储仓库中删除指定文件（需要签名认证）。

**请求头**

| 头 | 值 | 说明 |
|----|----|------|
| `X-Signature` | HMAC-SHA256 | 管理签名 |
| `X-Timestamp` | Unix 时间戳 | 签名时间戳 |

**响应**

```json
{
  "success": true,
  "sha": "abc123def456",
  "repo": "my-image-repo"
}
```

---

## 分享链接

### 生成分享链接

```
GET /share/{path}
```

生成一个带 HMAC 签名和过期时间的临时分享链接。

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `expires` | number | 当前时间 + 7 天 | 过期 Unix 时间戳（秒） |
| `filename` | string | 原始文件名 | 下载时的文件名（触发下载） |

**响应**

```
HTTP/1.1 302 Found
Location: /images/photo.jpg?__share_sig=abc...&__share_exp=1717200000
```

**示例**

```bash
# 生成 24 小时后过期的分享链接
curl -v "https://image.example.com/share/images/photo.jpg?expires=$(( $(date +%s) + 86400 ))"
```

**验证方式**

分享链接生成后，访问 `/share/{path}` 会返回 302 重定向，指向带签名的文件路径。

文件访问时，中间件检测到 `__share_sig` 参数后，会验证签名和过期时间，跳过防盗链（Referer）检查。

---

## 管理 API

管理 API 端点需要管理员认证，所有端点以 `/admin` 为前缀。

### 认证

管理面板支持两种认证方式：

1. **Cloudflare Access (Zero Trust)** — 自动识别 `Cf-Access-Authenticated-User-Email` 请求头
2. **TOTP** — 通过 `Authorization: Bearer <totp-code>` 请求头认证

### 仓库管理

```
GET    /admin/api/repos                  # 列出所有仓库
POST   /admin/api/repos                  # 创建新仓库
GET    /admin/api/repos/:id              # 获取仓库详情
PUT    /admin/api/repos/:id              # 更新仓库配置
DELETE /admin/api/repos/:id              # 删除仓库
POST   /admin/api/repos/:id/sync         # 同步仓库元数据
POST   /admin/api/repos/:id/migrate      # 启动仓库数据迁移
GET    /admin/api/repos/migrations/:jobId # 获取迁移任务状态
POST   /admin/api/repos/migrations/:jobId/resume # 继续已暂停的迁移任务
```

**创建仓库请求体：**

```json
{
  "id": "repo-blog",
  "owner": "my-org",
  "name": "blog-images",
  "branch": "main",
  "capacityLimitBytes": 5368709120,
  "tokenSecretName": "GITHUB_TOKEN"
}
```

**仓库列表响应：**

```json
{
  "repos": [
    {
      "id": "repo-main",
      "owner": "my-org",
      "name": "images",
      "branch": "main",
      "status": "active",
      "sizeBytes": 1048576,
      "fileCount": 42,
      "capacityLimitBytes": 5368709120
    }
  ]
}
```

### 文件管理

```
GET    /admin/api/files              # 列出文件（分页）
GET    /admin/api/files?path=xxx     # 列出目录内容
DELETE /admin/api/files              # 删除文件或目录
POST   /admin/api/files/move         # 移动/重命名文件
```

**文件列表查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `path` | string | `/` | 目录路径 |
| `page` | number | `1` | 页码 |
| `limit` | number | `50` | 每页数量 |
| `search` | string | — | 搜索关键词 |

**文件列表响应：**

```json
{
  "files": [
    {
      "name": "photo.jpg",
      "path": "/images/photo.jpg",
      "type": "file",
      "size": 102400,
      "sha": "abc123",
      "repo": "repo-main",
      "updatedAt": "2025-06-01T12:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "hasMore": true
}
```

**删除请求体：**

```json
{
  "path": "/images/photo.jpg"
}
```

**删除目录：**

```json
{
  "path": "/images/old",
  "type": "dir"
}
```

**移动文件请求体：**

```json
{
  "source": "/images/old-name.jpg",
  "destination": "/images/new-name.jpg"
}
```

### 上传（管理面板）

```
POST /admin/api/upload
```

**请求头：**

| 头 | 值 | 说明 |
|----|----|------|
| `Authorization` | `Bearer <token>` 或 `<totp>` | 管理认证 |
| `Content-Type` | `multipart/form-data` | 文件上传 |

**请求体（multipart/form-data）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 要上传的文件 |
| `path` | string | 否 | 目标目录路径 |

**响应：**

```json
{
  "success": true,
  "url": "/images/uploaded-photo.jpg",
  "fullUrl": "https://{你的域名}/images/uploaded-photo.jpg",
  "path": "images/uploaded-photo.jpg",
  "repo": "repo-main",
  "size": 102400,
  "sha256": "abc123..."
}
```

### 统计

```
GET /admin/api/stats               # 获取系统概览统计
```

**响应：**

```json
{
  "totalRepos": 3,
  "totalFiles": 1250,
  "totalSizeBytes": 2147483648,
  "totalSizeFormatted": "2.00 GB",
  "repos": [
    {
      "id": "repo-main",
      "fileCount": 500,
      "sizeBytes": 1073741824,
      "sizeFormatted": "1.00 GB",
      "capacityPercent": 20.0
    }
  ]
}
```

### 审计日志

```
GET /admin/api/audit               # 查询审计日志
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | number | 返回条数（默认 `50`，最大 `200`） |
| `cursor` | string | 分页游标 |
| `action` | string | 按操作类型筛选 |
| `repoId` | string | 按仓库筛选 |

**响应：**

```json
{
  "entries": [
    {
      "timestamp": "2025-06-01T12:00:00.000Z",
      "action": "DELETE_FILE",
      "actor": "admin@example.com",
      "details": {
        "path": "/images/photo.jpg",
        "repo": "repo-main"
      },
      "ip": "203.0.113.1"
    }
  ],
  "cursor": "next-page-cursor"
}
```

### 分享管理

```
GET    /admin/api/shares             # 列出分享令牌
POST   /admin/api/shares             # 创建分享令牌
DELETE /admin/api/shares/:id         # 撤销分享令牌
```

**创建分享令牌请求体：**

```json
{
  "path": "/images/photo.jpg",
  "expiresIn": 3600
}
```

### 缓存管理

```
POST /admin/api/cache/purge        # 清除缓存
```

**请求体：**

```json
{
  "paths": ["/images/photo.jpg"],
  "purgeAll": false
}
```

### 配置管理

```
GET  /admin/api/config             # 获取运行时配置
PUT  /admin/api/config             # 更新运行时配置
```

---

## 健康检查

```
GET /healthz
```

**响应：**

```json
{
  "ok": true,
  "version": "1.0.0",
  "status": "ok",
  "env_configured": true,
  "config": "valid",
  "githubRate": [
    {
      "repo": "repo-main",
      "limit": 5000,
      "remaining": 4980,
      "reset": 1717200000
    }
  ],
  "features": {
    "signature": true,
    "referer_protection": true
  }
}
```

---

## 状态码汇总

| HTTP 状态码 | 含义 | 常见原因 |
|-------------|------|----------|
| `200` | 成功 | 正常响应 |
| `302` | 重定向 | 分享链接生成 |
| `304` | 未修改 | 客户端缓存有效 |
| `400` | 请求错误 | 参数缺失或格式错误 |
| `401` | 未授权 | 缺少签名或认证 |
| `403` | 禁止访问 | 签名无效、防盗链拦截 |
| `404` | 不存在 | 文件或路径不存在 |
| `413` | 请求体过大 | 文件超出大小限制 |
| `415` | 不支持的类型 | 不允许的文件 MIME 类型 |
| `429` | 请求过多 | 速率超限 |
| `500` | 服务器错误 | 内部异常 |
| `503` | 服务不可用 | 紧急熔断已激活 |

---

## 速率限制

所有 API 端点共享全局速率限制。超限时返回：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds."
}
``` |
| `500` | 服务器错误 | 内部异常 |
| `503` | 服务不可用 | 紧急熔断已激活 |

---

## 速率限制

所有 API 端点共享全局速率限制。超限时返回：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds."
}
```