# Step 4.7: Google Drive / OneDrive Provider — 调研与实施方案

> 生成日期：2026-07-18
> 基于 wigolo 深度搜索 + 4 个现有开源项目源码分析

---

## 目录

1. [调研结论](#1-调研结论)
2. [现有开源项目盘点](#2-现有开源项目盘点)
3. [Google Drive 技术方案](#3-google-drive-技术方案)
4. [OneDrive 技术方案](#4-onedrive-技术方案)
5. [国内直连方案](#5-国内直连方案)
6. [实施步骤](#6-实施步骤)
7. [具体代码设计](#7-具体代码设计)

---

## 1. 调研结论

### 核心结论

**没有现成的库可以直接嵌入我们的 `StorageProvider` 体系。** 所有现有项目都是独立的 Worker 应用，不是可组合的库。我们需要自己实现 `GoogleDriveProvider`，但可以借鉴它们的 OAuth 流程和 API 调用方式。

### 对比：Google Drive vs OneDrive

| 维度 | Google Drive | OneDrive |
|------|-------------|----------|
| 你的容量 | **Google AI Pro 5TB** ✅ | 免费版 5GB ❌ |
| API 类型 | Google Drive REST API v3 | Microsoft Graph API |
| 认证方式 | OAuth 2.0 + refresh_token | OAuth 2.0 + refresh_token |
| Workers 兼容 | ✅ `fetch()` 直接调用 | ✅ `fetch()` 直接调用 |
| 路径映射 | fileId 体系 | itemId 体系 |
| 国内直连 | 通过 CF 代理可达 | 通过 CF 代理可达 |
| 实施优先级 | **🥇 优先** | 🥈 扩展预留 |

**结论：** 你的 Google AI Pro 有 5TB 空间，且 Google Drive 在国内的 CF 代理方案成熟，优先做 Google Drive。OneDrive 接口设计为相同的 `StorageProvider` 模式，后续按需扩展。

---

## 2. 现有开源项目盘点

### 2.1 Google Drive 相关

| 项目 | 类型 | 功能 | 借鉴价值 |
|------|------|------|---------|
| [`cloudflare-gdrive`](https://github.com/Aynh/cloudflare-gdrive) | npm 包 | 文件浏览、上传、URL上传、直链下载 | ⭐⭐⭐ **OAuth 流程 + 流式代理下载** |
| [`cf-gdrive-worker`](https://github.com/nanfenggushi/cf-gdrive-worker) | 单文件 Worker | 文件浏览、代理下载、多线程、转存 | ⭐⭐⭐ **OAuth Playground 获取 refresh_token 步骤** |
| [`goindex`](https://github.com/alx-xlx/goindex) | Worker 脚本 | 只读文件列表索引 | ⭐ rclone 获取 refresh_token |
| [`mcp-gdrive-cf`](https://mcpservers.org/servers/brianmoney/mcp-gdrive-cf) | MCP Server | 完整 OAuth 2.0 + Drive CRUD | ⭐⭐ **KV 存储 token 方案** |

### 2.2 OneDrive 相关

| 项目 | 类型 | 功能 | 借鉴价值 |
|------|------|------|---------|
| [`onedrive-cf-index-ng`](https://github.com/lyc8503/onedrive-cf-index-ng) | Next.js + CF Pages | 文件浏览、预览、搜索 | ⭐ 参考其 Microsoft Graph API 路径 |
| [`FODI`](https://marxchou.com/article/fodi-onedrive-cloudflare-workers-guide/) | Worker 脚本 | OneDrive 文件列表 | ⭐ 中文部署指南 |

### 2.3 关键发现

**核心模式完全一致：**
```
1. 一次性配置 OAuth → 拿到 refresh_token
2. Worker 运行时用 refresh_token 换 access_token
3. 用 access_token 调 REST API
4. 过期后自动用 refresh_token 续期
```

**所有项目都依赖 rclone 或 OAuth Playground 获取 refresh_token，这不是运行时流程，是一次性配置。**

---

## 3. Google Drive 技术方案

### 3.1 认证流程

```
┌─────────────────────────────────────────────────────────┐
│ 一次性配置（30分钟，手工操作）                            │
│                                                         │
│ 1. Google Cloud Console → 创建项目 → 启用 Drive API      │
│ 2. OAuth 同意屏幕 → 外部 → 发布为"正式版"                │
│ 3. 创建 OAuth 2.0 客户端 ID (Web 应用)                   │
│ 4. OAuth Playground → 填入 CLIENT_ID/SECRET → 授权      │
│ 5. Exchange code for tokens → 拿到 refresh_token         │
│ 6. 将 refresh_token 设为 Cloudflare Secret               │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ Worker 运行时流程                                         │
│                                                         │
│ 请求到达 → 检查 access_token 是否过期                      │
│     ├─ 过期 → POST oauth2.googleapis.com/token 刷新      │
│     └─ 有效 → 直接使用                                   │
│                                                         │
│ 调用 Drive API → 返回结果                                 │
│ 每次 API 调用前自动 refresh（如遇 401 则重试）             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 API 映射

| StorageProvider 方法 | Google Drive REST API | 实现方式 |
|---------------------|----------------------|----------|
| `getBytes(path)` | `GET /drive/v3/files/{fileId}?alt=media` | fetch → arrayBuffer |
| `getStream(path)` | `GET /drive/v3/files/{fileId}?alt=media` | fetch → body (流式) |
| `put(path, data)` | `POST /upload/drive/v3/files?uploadType=multipart` | multipart 上传 |
| `delete(path)` | `DELETE /drive/v3/files/{fileId}` | 直接删除 |
| `exists(path)` | `GET /drive/v3/files/{fileId}?fields=id` | 检查 404 |
| `getFileInfo(path)` | `GET /drive/v3/files/{fileId}?fields=id,name,size,mimeType` | 解析元数据 |
| `list(prefix)` | `GET /drive/v3/files?q=...` | 按 parentId + 类型查询 |
| `getUsage()` | `GET /drive/v3/about?fields=storageQuota` | 获取配额信息 |
| `getUrl(path)` | 构造代理 URL `/${path}` | 同现有模式 |
| `getSignedUrl(path, exp)` | 调用现有 HMAC 签名 | 同现有模式 |

### 3.3 路径映射问题

Google Drive 使用 fileId（如 `1JFE64puRxwB3MdasFrumhTFYcFxJiN4Z`）而不是文件路径。解决方式：

**方案 A：利用现有 `path_providers` 表（推荐）**

```sql
-- 在 path_providers 表增加 external_id 字段（存储 fileId）
ALTER TABLE path_providers ADD COLUMN external_id TEXT;
```

```
path_providers:
┌──────────────────────┬─────────────┬──────────────┐
│ path                 │ provider_id │ external_id  │
├──────────────────────┼─────────────┼──────────────┤
│ /photos/cat.jpg      │ gdrive-main │ 1JFE64puRxw │
│ /docs/report.pdf     │ gdrive-main │ 13FmU4rGY2j │
└──────────────────────┴─────────────┴──────────────┘
```

**方案 B：在 Google Drive 中使用固定文件夹路径（简单方案）**

```
上传时：
  1. 检查 Drive 中是否有 /img-gateway/ 文件夹
  2. 没有则创建
  3. 所有文件存在 /img-gateway/{path} 下
  4. 用文件名作为查询依据（不依赖 fileId）
```

**推荐方案 A**——复用现有 `path_providers` 表，存储 fileId 映射，在首次上传时记录 `external_id`，后续读写直接查。

### 3.4 Token 刷新机制

```typescript
class GoogleDriveAuth {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken: string | null = null;
  private expiresAt: number = 0;

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    return this.refresh();
  }

  private async refresh(): Promise<string> {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data: any = await resp.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }
}
```

### 3.5 文件上传细节

Google Drive 上传需要 multipart 格式：

```typescript
// 上传文件
async put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void> {
  const token = await this.auth.getAccessToken();
  const fileId = await this.resolvePathToId(path);

  // 构造 multipart 请求
  const metadata = JSON.stringify({ name: path.split('/').pop()!, parents: [this.getParentFolderId(path)] });
  const blob = new Blob([data]);
  const formData = new FormData();
  formData.append('metadata', new Blob([metadata], { type: 'application/json' }));
  formData.append('file', blob);

  const resp = await fetch(
    fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: fileId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );
  if (!resp.ok) throw new ProviderWriteError(this.id, path, await resp.text());
}
```

---

## 4. OneDrive 技术方案

### 4.1 与 Google Drive 的异同

| 维度 | Google Drive | OneDrive |
|------|-------------|----------|
| API 端点 | `https://www.googleapis.com/drive/v3/` | `https://graph.microsoft.com/v1.0/me/drive/` |
| OAuth 端点 | `https://oauth2.googleapis.com/token` | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| 文件 ID 体系 | fileId (字符串) | itemId (字符串) |
| 路径映射 | 无原生路径，需 fileId 映射 | 有原生路径 API |
| 针对用户 | 使用 Google AI Pro 5TB | 个人 Microsoft 账号 |

### 4.2 OneDrive 的独特优势

**OneDrive 有原生路径解析 API，不需要 fileId 映射：**

```
# 直接用路径访问文件
GET /v1.0/me/drive/root:/photos/cat.jpg:/content

# 上传文件到指定路径
PUT /v1.0/me/drive/root:/photos/cat.jpg:/content
```

这意味着 OneDrive 的路径映射比 Google Drive 简单得多，但受限于你目前没有大容量 OneDrive 账号。

### 4.3 API 映射

| StorageProvider 方法 | Microsoft Graph API | 实现方式 |
|---------------------|--------------------|----------|
| `getBytes(path)` | `GET /me/drive/root:/{path}:/content` | fetch → arrayBuffer |
| `getStream(path)` | `GET /me/drive/root:/{path}:/content` | fetch → body (流式) |
| `put(path, data)` | `PUT /me/drive/root:/{path}:/content` | 直接 PUT |
| `delete(path)` | `DELETE /me/drive/root:/{path}` | 直接删除 |
| `exists(path)` | `GET /me/drive/root:/{path}` | 检查 404 |
| `getFileInfo(path)` | `GET /me/drive/root:/{path}` | 返回元数据 |
| `list(prefix)` | `GET /me/drive/root:/{prefix}:/children` | 列出子文件 |
| `getUsage()` | `GET /me/drive` | 配额信息 |

---

## 5. 国内直连方案

### 5.1 请求流程

```
用户(中国) → img.yuuverne.site (CF 节点) → Google Drive API → Worker → 用户
```

- ✅ 用户只连 CF 节点，国内完全可用
- ✅ Google Drive API 只对 Worker 可见（Worker 在境外节点执行）
- ⚠️ 文件数据经过 Worker 中转，但 Workers 支持流式转发，不占额外内存

### 5.2 大文件处理

Google Drive 限制了它无法病毒扫描的文件类型的下载速度，但对常见图片格式（JPEG、PNG、WebP）没有此限制，本项目主要存图片，影响不大。

### 5.3 缓存策略

利用现有的 R2 缓存层，Google Drive 的文件在首次访问后缓存到 R2，后续访问直接走 R2：

```
首次访问：Google Drive → Worker → R2 缓存 → 用户
后续访问：R2 缓存 → 用户（无需再调 Google Drive API）
```

---

## 6. 实施步骤

### 第一步：Google OAuth 一次性配置（30分钟手工操作）

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1.1 | 访问 [Google Cloud Console](https://console.cloud.google.com/) | 创建新项目（或复用现有） |
| 1.2 | 启用 Google Drive API | API 库 → 搜索 "Google Drive API" → 启用 |
| 1.3 | 配置 OAuth 同意屏幕 | 用户类型选"外部"，应用发布状态设为"正式版"（确保 refresh_token 长期有效） |
| 1.4 | 创建 OAuth 2.0 客户端 ID | 应用类型选"Web 应用"，重定向 URI 添加 `https://developers.google.com/oauthplayground` |
| 1.5 | 打开 [OAuth Playground](https://developers.google.com/oauthplayground) | 齿轮设置 → 勾选 "Use your own OAuth credentials" → 填入 CLIENT_ID/SECRET |
| 1.6 | 授权 Drive API | 选择 scope `https://www.googleapis.com/auth/drive` → 授权 |
| 1.7 | 获取 refresh_token | 点击 "Exchange authorization code for tokens" → 复制 refresh_token |
| 1.8 | 设为 Cloudflare Secret | `npx wrangler secret put GOOGLE_DRIVE_REFRESH_TOKEN --env production` |
| 1.9 | 同时设 CLIENT_ID/SECRET | `wrangler secret put GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` |

### 第二步：实现 GoogleDriveProvider（~300行代码）

| 文件 | 内容 | 预估行数 |
|------|------|---------|
| `src/providers/googledrive/GoogleDriveProvider.ts` | 实现 `StorageProvider` 接口 | ~250行 |
| `src/providers/googledrive/auth.ts` | OAuth 2.0 token 刷新逻辑 | ~50行 |
| `src/providers/googledrive/types.ts` | GoogleDriveProviderSettings | ~20行（已有） |

### 第三步：路径映射

| 文件 | 改动 |
|------|------|
| `scripts/schema.sql` | 在 `path_providers` 表增加 `external_id TEXT` 字段 |
| `src/services/database.ts` | `recordFileAdditionV2` 增加 `externalId` 参数 |

### 第四步：密钥配置

在 `wrangler.toml` 或 Cloudflare Dashboard 中增加 secrets：

```
GOOGLE_DRIVE_CLIENT_ID      # OAuth 客户端 ID
GOOGLE_DRIVE_CLIENT_SECRET  # OAuth 客户端密钥
GOOGLE_DRIVE_REFRESH_TOKEN  # 长期有效的刷新令牌
```

### OneDrive 扩展（按需）

当需要扩展 OneDrive 时，实现模式完全一致：

```
src/providers/onedrive/
├── OneDriveProvider.ts      # 实现 StorageProvider（~200行，路径原生支持，更简单）
├── auth.ts                  # OAuth 2.0 token 刷新（~50行，和 Google 几乎一样）
└── types.ts                 # OneDriveProviderSettings
```

---

## 7. 具体代码设计

### 7.1 文件结构

```
src/providers/googledrive/
├── GoogleDriveProvider.ts   # 主实现
├── auth.ts                  # OAuth 认证
└── types.ts                 # 类型定义（已有，在 providers/types.ts 中）
```

### 7.2 auth.ts 设计

```typescript
// src/providers/googledrive/auth.ts

export interface GoogleDriveAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class GoogleDriveAuth {
  private config: GoogleDriveAuthConfig;
  private accessToken: string | null = null;
  private expiresAt: number = 0;

  constructor(config: GoogleDriveAuthConfig) {
    this.config = config;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to refresh Google Drive token: ${await resp.text()}`);
    }

    const data: any = await resp.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in - 60) * 1000; // 提前 60s 过期
    return this.accessToken!;
  }
}
```

### 7.3 GoogleDriveProvider.ts 设计

```typescript
// src/providers/googledrive/GoogleDriveProvider.ts

export class GoogleDriveProvider implements StorageProvider {
  readonly id: string;
  readonly type = 'googledrive' as const;
  readonly displayName: string;

  private auth: GoogleDriveAuth;
  private rootFolderId: string;
  private db: D1Database;  // 用于 path → fileId 映射查询

  // ============ 核心 I/O ============

  async getBytes(path: string): Promise<ArrayBuffer | null> {
    const fileId = await this.resolvePathToId(path);
    if (!fileId) return null;
    const token = await this.auth.getAccessToken();
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (resp.status === 404) return null;
    if (!resp.ok) throw new ProviderReadError(this.id, path);
    return resp.arrayBuffer();
  }

  async getStream(path: string): Promise<ReadableStream | null> {
    // 同 getBytes 但返回 resp.body
  }

  async put(path: string, data: ArrayBuffer | Uint8Array | string): Promise<void> {
    const token = await this.auth.getAccessToken();
    const existingFileId = await this.resolvePathToId(path);
    const parentId = await this.ensureFolderHierarchy(path);

    // 上传文件（multipart 格式）
    const metadata = JSON.stringify({
      name: path.split('/').pop()!,
      parents: [parentId],
    });

    const body = new FormData();
    body.append('metadata', new Blob([metadata], { type: 'application/json' }));
    body.append('file', new Blob([data]));

    const resp = await fetch(
      existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      }
    );
    if (!resp.ok) throw new ProviderWriteError(this.id, path, await resp.text());

    // 记录 fileId 映射
    const result: any = await resp.json();
    await this.recordPathMapping(path, result.id);
  }

  async delete(path: string): Promise<void> {
    const fileId = await this.resolvePathToId(path);
    if (!fileId) return;
    const token = await this.auth.getAccessToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // 删除映射记录
    await this.removePathMapping(path);
  }

  // ============ 元数据 ============

  async getFileInfo(path: string): Promise<ProviderFile | null> {
    const fileId = await this.resolvePathToId(path);
    if (!fileId) return null;
    const token = await this.auth.getAccessToken();
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return {
      path, name: data.name, size: parseInt(data.size || '0'),
      mimeType: data.mimeType,
    };
  }

  async list(prefix?: string): Promise<ProviderFile[]> {
    // 列出文件夹内容
  }

  async getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }> {
    // 从 D1 统计或调 Drive API
  }

  // ============ 内部方法 ============

  private async resolvePathToId(path: string): Promise<string | null> {
    // 从 path_providers 表查 external_id
  }

  private async ensureFolderHierarchy(path: string): Promise<string> {
    // 确保父文件夹存在，返回父文件夹 ID
    // 不存在则创建
  }

  private async recordPathMapping(path: string, fileId: string): Promise<void> {
    await dbService.recordFileAdditionV2(this.db, path, this.id, 0, undefined, undefined, fileId);
  }
}
```

### 7.4 现有代码需要做的改动

**scripts/schema.sql** — 增加 `external_id` 字段：
```sql
ALTER TABLE path_providers ADD COLUMN external_id TEXT;
```

**src/services/database.ts** — `recordFileAdditionV2` 增加 `externalId` 参数：
```typescript
recordFileAdditionV2: async (
  db, path, providerId, sizeBytes, hash?, repoId?, externalId?
) => {
  // 在 INSERT 中增加 external_id 字段
}
```

**src/types/env.d.ts** — 增加 Google Drive 密钥：
```typescript
GOOGLE_DRIVE_CLIENT_ID?: string;
GOOGLE_DRIVE_CLIENT_SECRET?: string;
GOOGLE_DRIVE_REFRESH_TOKEN?: string;
```

---

## 附录 A：参考项目链接

| 项目 | 链接 | 许可证 |
|------|------|--------|
| cloudflare-gdrive | https://github.com/Aynh/cloudflare-gdrive | MIT |
| cf-gdrive-worker | https://github.com/nanfenggushi/cf-gdrive-worker | MIT |
| goindex | https://github.com/alx-xlx/goindex | MIT |
| onedrive-cf-index-ng | https://github.com/lyc8503/onedrive-cf-index-ng | MIT |
| Google Drive API v3 | https://developers.google.com/workspace/drive/api/reference/rest/v3 | - |
| Microsoft Graph API | https://learn.microsoft.com/en-us/graph/onedrive-concept-overview | - |

## 附录 B：OAuth Playground 获取 refresh_token 详细步骤

```
1. 打开 https://developers.google.com/oauthplayground
2. 点击右上角齿轮 ⚙️
3. 勾选 "Use your own OAuth credentials"
4. 填入 CLIENT_ID 和 CLIENT_SECRET（从 Google Cloud Console 获取）
5. 关闭设置对话框
6. 左侧 API 列表 → 展开 "Drive API v3"
7. 勾选 https://www.googleapis.com/auth/drive （完整权限）
8. 点击 "Authorize APIs"
9. 用 Google AI Pro 账号登录授权
10. 点击 "Exchange authorization code for tokens"
11. 复制右侧的 Refresh token
12. 用 `wrangler secret put GOOGLE_DRIVE_REFRESH_TOKEN` 存入 Cloudflare
```