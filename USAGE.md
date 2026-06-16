# 使用指南

本文档介绍 Edge Image Gateway 的日常使用方法，包括文件管理、图片访问、分享链接生成等操作。

---

## 目录

- [管理面板](#管理面板)
- [上传图片](#上传图片)
- [访问与引用图片](#访问与引用图片)
- [删除文件](#删除文件)
- [生成分享链接](#生成分享链接)
- [生成签名 URL](#生成签名-url)
- [命令行签名工具](#命令行签名工具)
- [图片处理参数](#图片处理参数)
- [配置参考](#配置参考)
- [实用示例](#实用示例)
- [多仓库路由](#多仓库路由)
- [常见问题](#常见问题)

---

## 管理面板

部署完成后，访问 `https://你的域名/admin` 进入管理面板。

管理面板提供以下功能：

| 功能 | 说明 |
|------|------|
| **文件浏览** | 树形目录浏览、网格/列表切换、搜索、批量选择 |
| **回收站** | 查看已删除文件、清空回收站 |
| **审计日志** | 查看所有敏感操作的历史记录 |
| **API 令牌** | 生成和管理 API 访问令牌 |
| **系统设置** | 仓库管理、统计面板、写目标配置 |

---

## 上传图片

### 通过管理面板上传

1. 打开文件浏览器，导航到目标目录
2. 点击 **添加文件** 按钮或拖拽图片到文件区域
3. 上传完成后自动显示文件 URL

### 通过 API 上传

```bash
curl -X POST https://你的域名/admin/api/upload \
  -H "Authorization: Bearer <你的API令牌>" \
  -F "file=@/path/to/photo.jpg"
```

支持的文件类型：`image/png`、`image/jpeg`、`image/webp`、`image/avif`、`image/gif`、`image/svg+xml`

单文件大小限制：**25MB**

上传响应示例：

```json
{
  "url": "/photos/example-a1b2c3.jpg",
  "fullUrl": "https://你的域名/photos/example-a1b2c3.jpg",
  "path": "photos/example-a1b2c3.jpg",
  "repo": "my-repo",
  "size": 102400,
  "sha256": "abc123...",
  "uploadedAt": "2025-01-01T00:00:00.000Z",
  "deduplicated": false
}
```

> **注意**：上传后的文件名会自动添加内容哈希前缀和后缀时间戳，以确保全局唯一性。系统会自动去除 EXIF 等元数据以保护隐私。

---

## 访问与引用图片

上传完成后，通过返回的 `url` 或 `fullUrl` 直接访问图片：

```markdown
![图片描述](https://你的域名/photos/example-a1b2c3.jpg)
```

```html
<img src="https://你的域名/photos/example-a1b2c3.jpg" alt="图片描述">
```

### 图片处理

支持实时图片处理，通过查询参数控制：

```
https://你的域名/photos/example-a1b2c3.jpg?w=800&h=600&format=webp
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `w` | 宽度（像素） | `?w=400` |
| `h` | 高度（像素） | `?h=300` |
| `format` | 输出格式 | `?format=webp`、`?format=avif` |
| `q` | 质量（1-100） | `?q=80` |
| `fit` | 缩放模式 | `?fit=cover`、`?fit=crop` |

> 图片处理依赖 Cloudflare Image Resizing 功能，需要相应的套餐支持。

---

## 删除文件

### 通过管理面板删除

在文件浏览器中选择文件或文件夹，点击删除按钮即可。**注意：删除操作会直接在 GitHub 仓库中物理删除文件，不可恢复。**

### 通过 API 删除

删除单个文件：

```bash
curl -X DELETE "https://你的域名/admin/api/files/photos/example-a1b2c3.jpg" \
  -H "Authorization: Bearer <你的API令牌>"
```

删除整个目录：

```bash
curl -X DELETE "https://你的域名/admin/api/files/photos" \
  -H "Authorization: Bearer <你的API令牌>" \
  -H "Content-Type: application/json" \
  -d '{"type": "dir"}'
```

---

## 生成分享链接

### 通过管理面板生成

在文件浏览器中点击文件，打开预览侧边栏，点击 **生成分享链接** 按钮，设置过期时间即可。

### 通过 API 生成

```bash
curl -X POST https://你的域名/admin/api/files/share \
  -H "Authorization: Bearer <你的API令牌>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/photos/example-a1b2c3.jpg", "expires": 3600}'
```

参数说明：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `path` | 文件路径（必填） | — |
| `expires` | 过期时间（秒） | `86400`（24小时） |

响应示例：

```json
{
  "success": true,
  "sig": "abc123...",
  "exp": 1700000000,
  "url": "https://你的域名/photos/example-a1b2c3.jpg?sig=abc123...&exp=1700000000"
}
```

分享链接直接粘贴到浏览器即可访问，无需认证。

---

## 生成签名 URL

签名 URL 用于保护图片资源，防止未授权的第三方引用。支持两种方式：

### 方式一：通过分享 API（推荐）

使用上述[生成分享链接](#通过-api-生成)接口，附带 `expires` 参数即可。

### 方式二：命令行签名工具

项目提供了跨平台签名脚本，适用于 macOS、Linux 和 Windows：

```bash
npx tsx scripts/sign.ts /photos/example-a1b2c3.jpg 3600 your-sign-secret
```

参数说明：

| 参数 | 说明 |
|------|------|
| 第 1 个参数 | 文件路径（以 `/` 开头） |
| 第 2 个参数 | 有效期（秒） |
| 第 3 个参数 | `SIGN_SECRET`（需与 wrangler 配置一致） |

脚本输出：

```text
Signature: xyz789...
Expires:   1700003600
URL:       https://你的域名/photos/example-a1b2c3.jpg?sig=xyz789...&exp=1700003600
```

### 浏览器访问签名 URL

将生成的完整 URL 粘贴到浏览器地址栏即可访问：

```
https://你的域名/photos/example-a1b2c3.jpg?sig=xyz789...&exp=1700003600
```

---

## API 令牌管理

在管理面板的 **API 令牌** 页面可以生成和管理访问令牌：

1. 点击 **生成新令牌**，输入名称
2. 复制生成的令牌（关闭后不可再次查看）
3. 在 API 请求的 `Authorization` 头中使用

所有使用令牌的 API 请求都会记录审计日志。

---

## 图片处理参数

Edge Image Gateway 利用 Cloudflare Image Resizing 提供实时图片处理能力。支持的参数：

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `w` | 整数 | 目标宽度（像素） | `?w=400` |
| `h` | 整数 | 目标高度（像素） | `?h=300` |
| `fit` | 字符串 | 缩放模式：`scale-down`、`contain`、`cover`、`crop`、`pad` | `?fit=cover` |
| `format` | 字符串 | 输出格式：`auto`、`webp`、`avif`、`jpeg`、`png` | `?format=webp` |
| `q` | 整数 | 质量（1-100） | `?q=80` |
| `blur` | 整数 | 高斯模糊（3-250） | `?blur=50` |
| `sharp` | 浮点数 | 锐化（0-10） | `?sharp=0.5` |
| `brightness` | 浮点数 | 亮度（0-2，1 为原始） | `?brightness=1.2` |
| `contrast` | 浮点数 | 对比度（0-2，1 为原始） | `?contrast=1.1` |
| `gamma` | 浮点数 | 伽马值（0-10，1 为原始） | `?gamma=0.8` |

示例：生成 400×300 的 WebP 缩略图

```
https://你的域名/photos/example-a1b2c3.jpg?w=400&h=300&fit=cover&format=webp&q=80
```

---

## 配置参考

### wrangler.toml

参考项目根目录的 `wrangler.toml.example` 文件。关键环境变量：

```toml
[vars]
# HMAC 签名密钥（必填）
SIGN_SECRET = "your-sign-secret"

# 紧急熔断开关（可选，默认关闭）
EMERGENCY_LOCKDOWN = "false"

# 防盗链允许的 Referer（可选）
ALLOWED_REFERERS = "https://你的域名,https://你的博客.com"

# 管理面板管理员邮箱（可选，Access 认证用）
ADMIN_EMAILS = "admin@example.com"

# Telegram 告警机器人（可选）
TELEGRAM_BOT_TOKEN = "xxx"
TELEGRAM_CHAT_ID = "xxx"

# Sentry 错误监控 DSN（可选）
SENTRY_DSN = "https://xxx@xxx.ingest.us.sentry.io/xxx"
```

### 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| `SIGN_SECRET` | HMAC-SHA256 签名密钥，用于签名认证和分享链接 | 是 |
| `GITHUB_TOKEN` | GitHub 个人访问令牌（在 Secrets 中配置，非 Vars） | 是 |
| `REPO_REGISTRY` | Cloudflare KV 命名空间绑定（仅用于限流/监控） | 否 |
| `EMERGENCY_LOCKDOWN` | 紧急熔断开关，设为 `true` 拒绝所有写操作 | 否 |
| `ALLOWED_REFERERS` | 防盗链白名单，逗号分隔 | 否 |
| `ADMIN_EMAILS` | 管理面板管理员邮箱白名单，逗号分隔（Access 认证用） | 否 |
| `TELEGRAM_BOT_TOKEN` | Telegram 机器人 Token | 否 |
| `TELEGRAM_CHAT_ID` | Telegram 告警聊天 ID | 否 |
| `SENTRY_DSN` | Sentry 错误监控 DSN | 否 |

---

## 多仓库路由

如果配置了多个 GitHub 仓库，上传时会根据仓库剩余容量自动路由到合适的仓库。详见 [多仓库管理](docs/features/multi-repo.md)。

---

## 常见问题

**Q: 上传返回 401？**
A: 需要提供有效的 API 令牌，或在管理面板中通过 Access 认证后操作。

**Q: 图片访问返回 403？**
A: 可能触发了防盗链规则或签名验证失败。检查 `ALLOWED_REFERERS` 配置和签名 URL 是否正确。

**Q: 图片加载慢？**
A: 首次访问会从 GitHub 拉取并缓存，后续请求由 Cloudflare 边缘节点响应。确保已正确配置缓存。

**Q: 如何更换存储仓库？**
A: 在管理面板的"系统设置"中添加新仓库，设置为写目标，旧仓库文件可迁移。

---

## 实用示例

### 使用 PicGo 上传

[PicGo](https://molunerfinn.com/PicGo/) 是流行的图床客户端，可通过自定义 API 集成：

1. 在 PicGo 中选择「自定义 Web 图床」
2. API 地址：`https://{你的域名}/admin/api/upload`
3. POST 参数名：`file`
4. 自定义请求头：`Authorization: Bearer <你的API令牌>`
5. 自定义返回路径：`["url"]`

### 使用 Typora 自动上传

[Typora](https://typora.io/) 支持图片自动上传到自定义图床：

1. 打开 Typora → 偏好设置 → 图片
2. 上传服务选择「Custom Command」
3. 命令填写：
   ```bash
   curl -s -X POST https://{你的域名}/admin/api/upload \
     -H "Authorization: Bearer <你的API令牌>" \
     -F "file=@$1" | jq -r '.url'
   ```

### 批量上传脚本

```bash
#!/bin/bash
# 批量上传目录中的所有图片
for file in ./images/*.{jpg,png,webp,gif}; do
  [ -f "$file" ] || continue
  echo "上传: $file"
  curl -s -X POST "https://{你的域名}/admin/api/upload" \
    -H "Authorization: Bearer <你的API令牌>" \
    -F "file=@$file" | jq -r '.url'
done
```

### 在 Markdown 中使用

```markdown
<!-- 基本引用 -->
![图片](https://{你的域名}/images/photo.jpg)

<!-- 响应式图片（HTML） -->
<img src="https://{你的域名}/images/photo.jpg" 
     srcset="https://{你的域名}/images/photo.jpg?w=400 400w,
             https://{你的域名}/images/photo.jpg?w=800 800w"
     sizes="(max-width: 600px) 400px, 800px"
     alt="响应式图片">

<!-- 指定格式 -->
<picture>
  <source srcset="https://{你的域名}/images/photo.jpg?format=avif" type="image/avif">
  <source srcset="https://{你的域名}/images/photo.jpg?format=webp" type="image/webp">
  <img src="https://{你的域名}/images/photo.jpg" alt="渐进增强图片">
</picture>
```

### 使用 Python 上传

```python
import requests

def upload_image(file_path, api_url, token):
    with open(file_path, 'rb') as f:
        response = requests.post(
            f"{api_url}/admin/api/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": f}
        )
    return response.json()

result = upload_image("photo.jpg", "https://{你的域名}", "<token>")
print(f"URL: {result['fullUrl']}")
```

### 使用 Node.js 上传

```javascript
import { readFile } from 'node:fs/promises';
import { Blob } from 'node:buffer';

async function uploadImage(filePath, apiUrl, token) {
  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), filePath.split('/').pop());
  
  const res = await fetch(`${apiUrl}/admin/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

const result = await uploadImage('photo.jpg', 'https://{你的域名}', '<token>');
console.log('URL:', result.fullUrl);
```
