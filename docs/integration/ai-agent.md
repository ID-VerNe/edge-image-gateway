# AI Agent 接入指南

本文档面向 AI Agent（Claude / ChatGPT / Cursor / 自动化脚本等），提供接入 Edge Image Gateway 图床所需的全部信息。单文件自包含，可直接投喂给 Agent 使用。

---

## 接入参数

Agent 需要从管理员处获取以下两个值：

| 参数 | 说明 | 示例 |
|------|------|------|
| `BASE_URL` | 图床服务域名 | `https://img.yuuverne.site` |
| `TOKEN` | API 令牌（管理面板 → API 令牌 页面生成） | `imgtok_xxxxxxxx` |

> 生产环境域名为 `https://img.yuuverne.site`，下文示例均使用此域名。

---

## 认证方式

所有写操作（上传、删除、分享）使用 Bearer Token 认证：

```
Authorization: Bearer <TOKEN>
```

读取图片（`GET /{path}`）无需认证，除非目标路径启用了防盗链或签名保护。

---

## 核心操作

### 1. 上传图片（最常用）

```
POST {BASE_URL}/admin/api/upload
```

**请求**：`multipart/form-data`

| 字段 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | 图片文件 |
| `targetDir` | 否 | 目标目录（不含文件名），如 `blog/2025`。默认传空或不传，上传到根目录 |
| `dedupe` | 否 | 去重策略，默认 `reuse`（SHA-256 相同直接返回已有链接） |

**curl 示例**：

```bash
curl -X POST "https://img.yuuverne.site/admin/api/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@photo.jpg" \
  -F "targetDir=agent"
```

**成功响应（200）**：

```json
{
  "url": "https://img.yuuverne.site/agent/photo-a1b2-xyz123.jpg",
  "fullUrl": "https://img.yuuverne.site/agent/photo-a1b2-xyz123.jpg",
  "path": "agent/photo-a1b2-xyz123.jpg",
  "repo": "repo-main",
  "size": 102400,
  "sha256": "abc123...",
  "uploadedAt": "2025-06-01T12:00:00.000Z",
  "deduplicated": false
}
```

**Agent 应注意**：

- 带 `Authorization` 头请求时，`url` 字段即为完整可访问 URL，直接返回给用户即可
- `deduplicated: true` 表示该图片已存在，返回的是已有文件的 URL
- 文件名会被自动重写为 `{原名}-{hash4位}{时间戳}.{扩展名}`，不保留原始文件名
- 若令牌配置了 `pathPrefix`，上传会自动落到该前缀目录；`targetDir` 必须位于前缀之内，否则返回 403

### 2. 访问图片 / 图片处理

上传后直接访问返回的 URL，无需认证：

```
GET {BASE_URL}/{path}
```

支持实时图片处理参数（按需拼接在 URL 上）：

| 参数 | 说明 | 示例 |
|------|------|------|
| `w` | 缩放宽度（像素） | `?w=800` |
| `h` | 缩放高度（像素） | `?h=600` |
| `q` | 质量 1-100，默认 85 | `?q=75` |
| `fit` | 缩放模式：`scale-down` / `contain` / `cover` / `crop` / `pad` | `?fit=crop` |
| `format` | 输出格式：`auto` / `avif` / `webp` / `json` | `?format=webp` |

**示例**：生成 400x400 裁剪缩略图（WebP）：

```
https://img.yuuverne.site/agent/photo-a1b2-xyz123.jpg?w=400&h=400&fit=crop&format=webp
```

### 3. 删除文件

```
DELETE {BASE_URL}/admin/api/files/{path}
```

**curl 示例（删除单个文件）**：

```bash
curl -X DELETE "https://img.yuuverne.site/admin/api/files/agent/photo-a1b2-xyz123.jpg" \
  -H "Authorization: Bearer <TOKEN>"
```

**删除目录**（需加确认参数）：

```bash
curl -X DELETE "https://img.yuuverne.site/admin/api/files/agent?type=dir&confirm=true" \
  -H "Authorization: Bearer <TOKEN>"
```

**响应**：

```json
{ "success": true }
```

目录删除返回 `{ "success": true, "deletedCount": N }`。目录删除单次最多 100 个文件，超出返回 400。

### 4. 生成临时分享链接

为受保护路径或临时分享生成带签名的 URL：

```
POST {BASE_URL}/admin/api/files/share
Content-Type: application/json
```

**请求体**：

```json
{
  "path": "/agent/photo-a1b2-xyz123.jpg",
  "expires": 3600
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 文件路径（以 `/` 开头） |
| `expires` | 否 | 有效期（秒），默认 `86400`（24 小时） |

**响应**：

```json
{
  "success": true,
  "sig": "abc...",
  "exp": 1717200000,
  "url": "https://img.yuuverne.site/agent/photo-a1b2-xyz123.jpg?sig=abc...&exp=1717200000"
}
```

`url` 在过期时间前可直接访问，过期后失效。

### 5. 列出文件

```
GET {BASE_URL}/admin/api/files?path=/{目录}&page=1&limit=50
```

```bash
curl "https://img.yuuverne.site/admin/api/files?path=/agent&page=1&limit=50" \
  -H "Authorization: Bearer <TOKEN>"
```

支持 `search` 关键词搜索。响应含 `files` 数组、`total`、`hasMore`。

### 6. 健康检查

```
GET {BASE_URL}/healthz
```

无需认证。接入前可先调用此端点验证服务可用性。

---

## 限制与规则

| 规则 | 值 |
|------|-----|
| 单文件大小上限 | 25MB |
| 允许的格式 | png / jpg / jpeg / gif / webp / avif / svg / bmp / ico / tiff |
| 文件内容校验 | 魔数（magic bytes）必须与扩展名匹配，伪造扩展名返回 400 |
| 上传去重 | 默认开启，SHA-256 相同直接返回已有链接（`deduplicated: true`） |
| 元数据 | 上传时自动剥离图片 EXIF 等元数据 |
| 速率限制 | 全局共享，超限返回 429 + `Retry-After` 头 |
| 路径限制 | 禁止路径穿越（`..`），`/private/`、`/draft/`、`/raw/` 需签名访问 |

---

## 错误处理速查

Agent 收到错误响应时的处理建议：

| HTTP 状态码 | 含义 | Agent 处理方式 |
|-------------|------|---------------|
| `400` | 文件缺失 / 扩展名不支持 / 内容与扩展名不符 | 检查文件与扩展名，勿重试原请求 |
| `401` | Token 无效或缺失 | 提示用户检查 TOKEN，勿重试 |
| `403` | 签名无效 / 超出令牌 pathPrefix 权限 / 防盗链拦截 | 检查路径是否在令牌权限范围内 |
| `404` | 文件不存在 | 勿重试 |
| `413` | 文件超过 25MB | 提示用户压缩或换文件 |
| `429` | 速率超限 | 读取 `Retry-After` 头，等待后重试 |
| `500` | 服务端错误（如 GitHub API 失败） | 可重试 1-2 次，间隔递增 |
| `503` | 系统熔断 | 提示服务暂不可用，勿重试 |

错误响应统一格式：

```json
{ "error": "错误描述" }
```

---

## 最小可用示例

一段自检脚本，验证接入是否成功：

```bash
# 1. 健康检查
curl -s "https://img.yuuverne.site/healthz"

# 2. 上传测试图片（用 1x1 像素 PNG 测试）
printf '\x89\x50\x4E\x47\x0D\x0A\x1A\x0A\x00\x00\x00\x0D\x49\x48\x44\x52\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1F\x15\xC4\x89\x00\x00\x00\x0D\x49\x44\x41\x54\x78\x9C\x62\x00\x01\x00\x00\x05\x00\x01\x0D\x0A\x2D\xB4\x00\x00\x00\x00\x49\x45\x4E\x44\xAE\x42\x60\x82' > test.png
curl -s -X POST "https://img.yuuverne.site/admin/api/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@test.png" \
  -F "targetDir=agent-test"
# 预期返回 JSON，取 url 字段即上传后的图片地址
```

---

## 相关文档

- [接入指南总览](index.md) — 认证方式与各语言客户端
- [Python / TypeScript / PHP 客户端封装](index.md#各语言接入)
- [完整 API 参考](../features/api-reference.md) — 全部端点与参数
