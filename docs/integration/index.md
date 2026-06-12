# 接入指南

第三方应用接入 Edge Image Gateway 的总览文档。

---

## 你需要的信息

| 信息 | 获取方式 |
|------|---------|
| 服务域名 | 部署后的域名，如 `https://img.example.com` |
| API 令牌 | 管理面板 → API 令牌 页面生成 |
| SIGN_SECRET | 部署时配置的环境变量（签名认证时需要） |

## 认证方式

- **公共读**：`GET /{path}` 直接访问，无需认证
- **API 令牌**：`Authorization: Bearer <token>` 用于上传、删除等管理操作
- **签名认证**：`?sig=xxx&exp=xxx` 用于访问受保护路径（`/private/`、`/draft/`、`/raw/`）

## 核心 API

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/{path}` | GET | 无 | 获取图片，支持 `?w=&h=&q=&fit=` |
| `/admin/api/upload` | POST | Bearer | 上传图片（multipart, `file` + `targetDir`） |
| `/admin/api/files` | DELETE | Bearer | 删除文件 `{"path": "..."}` |
| `/admin/api/files/share` | POST | Bearer | 生成分享链接 `{"path":"...", "expires":86400}` |

## 各语言接入

| 语言 | 文档 |
|------|------|
| Python | [Python 接入指南](python.md) |
| TypeScript / Node.js | [TypeScript 接入指南](typescript.md) |
| PHP | [PHP 接入指南](php.md) |

## 工具配置速查

| 工具 | 关键配置 |
|------|---------|
| **PicGo** | 自定义 Web 图床，API 地址 `https://{域名}/admin/api/upload`，POST 参数名 `file`，请求头 `Authorization: Bearer <token>`，返回路径 `["fullUrl"]` |
| **Typora** | 图片 → Custom Command：`curl -s -X POST "https://{域名}/admin/api/upload" -H "Authorization: Bearer <token>" -F "file=@$1" \| jq -r '.fullUrl'` |
| **Obsidian** | Image Auto Upload 插件，Upload URL 同上，Additional Headers 加 `Authorization: Bearer <token>`，Image URL Path 填 `fullUrl` |

## 签名算法

HMAC-SHA256，消息格式 `{path}|{exp}`，输出 Base64URL 编码（无填充）。各语言实现见对应接入文档。

## 限制

- 文件大小：最大 25MB
- 支持格式：png / jpeg / webp / avif / gif / svg+xml
- 上传去重：SHA-256 哈希检测，重复图片直接返回已有链接
- 图片处理：依赖 Cloudflare Image Resizing（`?w=400&h=300&fit=cover&format=webp`）