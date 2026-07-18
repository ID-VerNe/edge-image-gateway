# Phase 4: 可插拔后端架构 — 完整实施计划

> 生成日期：2026-07-18
> 基于三次 deep-mode 源码级分析：
> - **flydrive-js/core** v2.1.0 (MIT) — Disk API + DriverContract 接口
> - **@tweedegolf/storage-abstraction** v3.0.x (MIT) — AbstractAdapter 模板方法模式
> - **@voyant-travel/storage** v0.111.1 (Apache-2.0) — StorageProvider 接口 + Resolver 模式

---

## 目录

1. [三方库分析结论](#1-三方库分析结论)
2. [架构设计决策](#2-架构设计决策)
3. [Provider 接口定义](#3-provider-接口定义)
4. [GitHubProvider 实现方案](#4-githubprovider-实现方案)
5. [S3Provider 实现方案](#5-s3provider-实现方案)
6. [GoogleDriveProvider 调研方案](#6-googledriveprovider-调研方案)
7. [Provider 注册表与路由](#7-provider-注册表与路由)
8. [D1 Schema 扩展](#8-d1-schema-扩展)
9. [管理面板 UI 变更](#9-管理面板-ui-变更)
10. [实施步骤与依赖关系](#10-实施步骤与依赖关系)
11. [文件结构](#11-文件结构)
12. [迁移策略](#12-迁移策略)

---

## 1. 三方库分析结论

### 1.1 共同结论：三个库都不能直接在 Cloudflare Workers 运行

| 库 | 版本 | 许可证 | Workers 兼容 | 原因 |
|---|------|--------|-------------|------|
| flydrive-core | v2.1.0 | MIT | ❌ | `node:fs`, `node:path`, `node:stream`, `@aws-sdk/client-s3`, `@google-cloud/storage`, `debuglog` |
| storage-abstraction | v3.0.x | MIT | ❌ | `require()` 动态加载, `node:fs`, `node:stream`, 全量 AWS/GCS/Azure SDK（安装 100-150MB） |
| voyant-storage | v0.111.1 | Apache-2.0 | ❌ | `@aws-sdk/client-s3`（但接口本身兼容 Workers） |

### 1.2 可借鉴的设计模式

| 来自 | 模式 | 借鉴价值 |
|------|------|----------|
| **flydrive** | `Disk` 类包装 `DriverContract` | ⭐⭐⭐ 核心参考：清晰的关注点分离 |
| **flydrive** | 3 阶段 Key Normalization | ⭐⭐⭐ 路径安全 + 规范化 |
| **flydrive** | 类型化错误 + `{ cause }` | ⭐⭐ 一致的错误处理 |
| **flydrive** | `bucket()` 方法（多 bucket 支持） | ⭐⭐ 适合本项目多 repo 场景 |
| **flydrive** | `supportsACL` 模式 | ⭐⭐⭐ R2 兼容性处理直接可用 |
| **flydrive** | `WriteOptions`/`ReadOptions` 类型设计 | ⭐⭐ 可扩展的选项模式 |
| **storage-abstraction** | 适配器注册表 | ⭐⭐ 动态加载 provider |
| **storage-abstraction** | Provider-specific 子类 | ⭐ 继承基类 + 覆盖差异方法 |
| **storage-abstraction** | 显式 `getSignedURL`/`getPresignedUploadURL` | ⭐⭐ 适合本项目的分享功能 |
| **voyant** | `StorageProviderResolver`（逻辑名 → 物理） | ⭐⭐⭐ 解耦业务逻辑和存储后端 |
| **voyant** | `signedUrl?` 可选方法 | ⭐⭐⭐ 类型层面表达能力 |
| **voyant** | 工厂函数而非类 | ⭐⭐ 测试友好 |
| **voyant** | 一致性测试运行器 | ⭐⭐⭐ 确保 provider 实现正确 |
| **voyant** | `client` 注入（测试用 mock） | ⭐⭐ 可测试性 |
| **voyant** | 独立导出路径（tree-shaking） | ⭐ Worker bundle 体积优化 |

---

## 2. 架构设计决策

### 决策 1：不引入任何外部库，自实现 Provider 体系

**理由：**
1. 三个库都依赖 Node.js 特定 API，无法在 Workers 运行
2. 本项目核心是 GitHub Content API（base64），不是标准 S3 协议
3. 自实现接口更轻量（保留 150KB bundle 预算）
4. 完全控制错误处理和行为

### 决策 2：参考 flydrive 的 Disk + Driver 模式，但针对 Workers 做简化

**理由：**
- flydrive 的 19 方法 DriverContract 中有 8 个方法（`getUrl`, `getSignedUrl`, `getSignedUploadUrl`, `setVisibility`, `getVisibility`, `getMetaData`, `copy`, `move`）本项目当前不需要
- Workers 环境没有 `Readable` 流（只有 `ReadableStream`），`putStream` 需要适配
- 本项目更重要的是 `list` 和 `getTree`（管理面板需要）

### 决策 3：采用 voyant 的 `StorageProviderResolver` 模式

**理由：**
- 当前 `resolveForRead(path)` 和 `resolveForWrite(env)` 是函数式调用，没有抽象层
- 引入 `Resolver` 后，业务代码不再关心具体后端
- 与当前 repoRouter 的 `cachedRepos` 机制兼容

### 决策 4：Provider 实现采用工厂函数（非类）

**理由：**
- Workers 无状态运行环境，工厂函数更轻量
- 易于测试（注入 mock 后端）
- 与 voyant 的最佳实践一致

### 决策 5：保留现有 repoRouter 作为兼容层，逐步迁移

**理由：**
- 现有代码库大量使用 `repoRouter.resolveForRead()` 和 `resolveForWrite()`
- 逐步迁移而非一次性替换，降低风险
- 兼容层返回 `StorageProvider` 包装的 ResolvedRepo

---

## 3. Provider 接口定义

### 3.1 核心接口

```typescript
// src/providers/types.ts

/**
 * 文件元数据
 */
export interface ProviderFile {
  path: string;
  name: string;
  size: number;
  sha?: string;          // GitHub 特有
  mimeType?: string;
  lastModified?: string;
}

/**
 * 写操作选项
 */
export interface ProviderWriteOptions {
  contentType?: string;
  message?: string;      // commit message（GitHub 特有）
  visibility?: 'public' | 'private';
}

/**
 * 读操作选项
 */
export interface ProviderReadOptions {
  range?: { start?: number; end?: number };
}

/**
 * 列表操作选项
 */
export interface ProviderListOptions {
  recursive?: boolean;
  limit?: number;
  paginationToken?: string;
}

/**
 * 存储 Provider 接口
 */
export interface StorageProvider {
  /** Provider 唯一标识 */
  readonly id: string;
  /** Provider 类型 */
  readonly type: ProviderType;
  /** 显示名称（管理面板用） */
  readonly displayName: string;

  // ============ 核心 I/O ============

  /** 读取文件内容为 ArrayBuffer */
  getBytes(path: string, options?: ProviderReadOptions): Promise<ArrayBuffer | null>;

  /** 读取文件内容为 ReadableStream */
  getStream(path: string, options?: ProviderReadOptions): Promise<ReadableStream | null>;

  /** 写入文件 */
  put(path: string, data: ArrayBuffer | Uint8Array | string, options?: ProviderWriteOptions): Promise<void>;

  /** 删除文件 */
  delete(path: string, sha?: string): Promise<void>;

  /** 检查文件是否存在 */
  exists(path: string): Promise<boolean>;

  // ============ 元数据 ============

  /** 获取文件信息 */
  getFileInfo(path: string): Promise<ProviderFile | null>;

  /** 获取目录树（管理面板用） */
  getTree(prefix?: string, recursive?: boolean): Promise<ProviderFile[]>;

  /** 获取 Provider 使用统计 */
  getUsage(): Promise<{ usedBytes: number; fileCount: number; capacityBytes: number }>;

  // ============ 可选功能 ============

  /** 获取公开 URL（可选——不是所有后端都支持） */
  getUrl?(path: string): Promise<string>;

  /** 获取签名 URL（可选） */
  getSignedUrl?(path: string, expiresIn: number): Promise<string>;

  /** 获取签名上传 URL（可选） */
  getSignedUploadUrl?(path: string, expiresIn: number): Promise<string>;
}

export type ProviderType = 'github' | 's3' | 'googledrive' | 'memory';
```

### 3.2 Provider 配置

```typescript
// src/providers/types.ts

/** 基础 Provider 配置（存储在 D1 providers 表） */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;           // 显示名称
  status: 'active' | 'readonly' | 'draining' | 'archived';
  capacityLimitBytes: number;
  settings: Record<string, string>; // Provider 特有配置（JSON）
}

/** GitHub Provider 特有配置 */
export interface GitHubProviderSettings {
  owner: string;
  repo: string;
  branch: string;
  tokenSecretName: string;
}

/** S3 Provider 特有配置 */
export interface S3ProviderSettings {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
  supportsACL?: boolean;
}

/** Google Drive Provider 特有配置 */
export interface GoogleDriveProviderSettings {
  folderId?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}
```

### 3.3 ProviderResolver

```typescript
// src/providers/resolver.ts

/**
 * Provider 解析器 —— 将逻辑名解析为具体的 StorageProvider 实例。
 * 参考 voyant 的 StorageProviderResolver 模式。
 */
export interface ProviderResolver {
  /** 根据路径解析读取用的 Provider */
  resolveForRead(path: string): Promise<StorageProvider>;

  /** 解析写入用的 Provider（根据容量和状态） */
  resolveForWrite(requiredBytes?: number): Promise<StorageProvider>;

  /** 根据 ID 获取 Provider */
  getProvider(id: string): Promise<StorageProvider | null>;

  /** 获取所有可用 Provider */
  listProviders(): Promise<StorageProvider[]>;
}
```

---

## 4. GitHubProvider 实现方案

### 4.1 设计

```typescript
// src/providers/github/GitHubProvider.ts

export class GitHubProvider implements StorageProvider {
  readonly id: string;
  readonly type = 'github' as const;
  readonly displayName: string;

  private service: GitHubService;
  private config: GitHubProviderSettings;

  constructor(id: string, config: GitHubProviderSettings, env: Bindings) {
    this.id = id;
    this.config = config;
    this.displayName = `${config.owner}/${config.repo}`;
    this.service = new GitHubService();
  }

  // 实现所有 StorageProvider 方法
  // 内部调用 githubService 的现有方法
}
```

### 4.2 方法映射

| StorageProvider 方法 | GitHubService 方法 | 说明 |
|---------------------|-------------------|------|
| `getBytes(path)` | `fetchRaw(path)` → `arrayBuffer()` | 获取原始内容 |
| `getStream(path)` | `fetchRaw(path)` → `body` | 直接返回流 |
| `put(path, data)` | `putFile(path, base64(data), message)` | 先 base64 编码 |
| `delete(path, sha?)` | `deleteFile(path, sha, message)` | 需要 sha 参数 |
| `exists(path)` | `fileExists(path)` | HEAD 请求 |
| `getFileInfo(path)` | `getFile(path)` | 获取元数据 |
| `getTree(prefix)` | `getTree(recursive)` + 过滤 | 管理面板浏览 |
| `getUsage()` | 配合 D1 统计 | 从 D1 repos 表读取 |
| `getUrl(path)` | 构造 URL `/${path}` | 返回站点相对 URL |
| `getSignedUrl(path, exp)` | 调用 `generateHMAC` | 复用现有签名机制 |

### 4.3 包装现有代码

现有 `githubService` 的方法签名需要微调：

```typescript
// 当前：githubService.fetchRaw(path, repo, cfOptions, env, ctx)
// 改为：GitHubProvider 内部持有 token 和 repo 信息，直接调用

private async getRepo(): Promise<ResolvedRepo> {
  return {
    meta: {
      id: this.id,
      owner: this.config.owner,
      name: this.config.repo,
      branch: this.config.branch,
      status: 'active',
      sizeBytes: 0,      // 从 D1 读取
      fileCount: 0,
      capacityLimitBytes: 0,
      tokenSecretName: this.config.tokenSecretName,
    },
    token: getTokenFromEnv(this.env, this.config.tokenSecretName),
  };
}
```

---

## 5. S3Provider 实现方案

### 5.1 Workers 兼容的 S3 客户端

不能使用 `@aws-sdk/client-s3`（Node.js 依赖），需要自实现 fetch-based SigV4 签名：

```typescript
// src/providers/s3/sigv4.ts

/**
 * AWS SigV4 签名 —— 纯 fetch 实现，完全 Workers 兼容。
 * 参考 aws4fetch 库的算法。
 */
export async function signRequest(
  request: Request,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string,
  service: string
): Promise<Request> {
  // 实现 SigV4 签名算法
  // 1. 创建 canonical request
  // 2. 创建 string to sign
  // 3. 计算 signature
  // 4. 添加 Authorization header
}
```

### 5.2 S3Provider 方法映射

| StorageProvider 方法 | S3 API | 实现方式 |
|---------------------|--------|----------|
| `getBytes(path)` | `GetObject` → `Body.transformToByteArray()` | fetch + SigV4 |
| `getStream(path)` | `GetObject` → `body` | 直接转发流 |
| `put(path, data)` | `PutObject` | fetch + 签名 |
| `delete(path)` | `DeleteObject` | fetch + 签名 |
| `exists(path)` | `HeadObject` | fetch HEAD + 签名，404 返回 false |
| `getFileInfo(path)` | `HeadObject` | 解析响应头 |
| `getTree(prefix)` | `ListObjectsV2` | 解析 XML 响应 |
| `getUsage()` | 需要额外统计 | 或从 D1 读取 |
| `getUrl(path)` | 构造 `https://{bucket}.s3.amazonaws.com/{path}` | 根据 endpoint 构造 |
| `getSignedUrl(path, exp)` | `GetObject` 预签名 URL | 自实现 SigV4 查询参数签名 |

### 5.3 R2 兼容性

参考 flydrive 的 `supportsACL` 模式：

```typescript
// 当用于 Cloudflare R2 时
const provider = new S3Provider('r2-cache', {
  bucket: 'img-host-cache',
  region: 'auto',
  endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
  supportsACL: false,  // R2 不支持 ACL
  forcePathStyle: true,
});
```

---

## 6. GoogleDriveProvider 调研方案

### 6.1 技术可行性

**Google Drive API 访问方式：**

| 方式 | Workers 兼容 | 说明 |
|------|-------------|------|
| `@googleapis/drive` (npm) | ❌ | 依赖 `google-auth-library`，使用 `node:http` |
| REST API 直接调用 | ✅ | `fetch()` 直接调用 `https://www.googleapis.com/drive/v3/files` |
| OAuth2 服务账号 | ✅ | 使用 Google Service Account + JWT 签名（可用 `crypto.subtle`） |
| OAuth2 用户授权 | ✅ | 需要 OAuth 回调（适合管理面板首次配置） |

### 6.2 推荐方案：REST API + 服务账号

```
Google Drive API 访问流程：
1. 配置 Google Service Account（JSON key）
2. Workers 使用 `crypto.subtle.sign()` 生成 JWT
3. JWT 换取 access_token
4. 使用 access_token 调用 Google Drive REST API
5. 文件缓存到 R2 以加速国内访问
```

### 6.3 API 映射

| 操作 | Google Drive REST API | 说明 |
|------|----------------------|------|
| 上传 | `POST /upload/drive/v3/files` | multipart 或简单上传 |
| 读取 | `GET /drive/v3/files/{fileId}?alt=media` | 直接下载 |
| 删除 | `DELETE /drive/v3/files/{fileId}` | 软删除（进回收站） |
| 列表 | `GET /drive/v3/files?q=...` | 按文件夹/类型查询 |
| 元数据 | `GET /drive/v3/files/{fileId}?fields=...` | 获取文件信息 |

### 6.4 国内直连问题

**问题：** `www.googleapis.com` 在国内被墙，Worker 在境外可以访问，但用户直接请求时可能被墙。

**解决思路（待确认）：**

```
方案 A: Worker 全权代理（当前架构）
  用户 → img.yuuverne.site (CF Worker) → Google Drive API → Worker → 用户
  ✅ 用户只连 CF 节点，国内可用
  ❌ 文件数据经过 Worker 中转，大文件增加延迟和带宽

方案 B: 预取 + R2 缓存
  上传时 Worker 拉取文件 → 存 R2 → 用户从 R2 读取
  ✅ 第一次访问后与 R2 速度一致
  ❌ 首次访问慢

方案 C: Google Drive 直接分享链接
  上传后获取 Google Drive 分享链接 → 用户直接访问
  ✅ 无中转延迟
  ❌ 国内被墙，需要配合反代
```

---

## 7. Provider 注册表与路由

### 7.1 ProviderRegistry

```typescript
// src/providers/registry.ts

/**
 * Provider 注册表 —— 管理所有可用的 StorageProvider 实例。
 * 参考：voyant 的 StorageProviderResolver + storage-abstraction 的 adapter 注册表
 */
export class ProviderRegistry {
  private providers: Map<string, StorageProvider> = new Map();
  private currentWriteId: string | null = null;
  private readRules: ReadRule[] | null = null;

  /** 从 D1 加载所有 Provider */
  async loadFromD1(db: D1Database, env: Bindings): Promise<void> {
    const rows = await db.prepare(`SELECT * FROM providers`).all();
    for (const row of rows.results as any[]) {
      const provider = this.createProvider(row, env);
      if (provider) {
        this.providers.set(provider.id, provider);
      }
    }
    this.currentWriteId = await getConfig(db, 'route::current_write');
  }

  /** 根据配置创建 Provider 实例 */
  private createProvider(row: any, env: Bindings): StorageProvider | null {
    const settings = JSON.parse(row.config);
    switch (row.type) {
      case 'github':
        return new GitHubProvider(row.id, settings, env);
      case 's3':
        return new S3Provider(row.id, settings, env);
      case 'googledrive':
        return new GoogleDriveProvider(row.id, settings, env);
      default:
        return null;
    }
  }

  /** 注册自定义 Provider（测试用） */
  register(provider: StorageProvider): void {
    this.providers.set(provider.id, provider);
  }

  resolveForRead(path: string): StorageProvider {
    // 1. 查 D1 paths 表获取 provider_id
    // 2. 查 read rules
    // 3. 返回 current write provider
    // 4. 返回第一个可用的
  }

  resolveForWrite(requiredBytes?: number): StorageProvider {
    // 当前 write provider 如果有空间则用它
    // 否则找下一个 active 且有空间的
  }
}
```

### 7.2 与现有 repoRouter 的兼容

```typescript
// src/services/repoRouter.ts —— 添加兼容层

/**
 * 兼容层：将 StorageProvider 包装为 ResolvedRepo
 * 在迁移期间，repoRouter 同时支持两种模式
 */
export async function resolveForRead(
  path: string,
  env: Bindings,
  waitUntil?: (promise: Promise<any>) => void
): Promise<ResolvedRepo> {
  // 如果 ProviderRegistry 已初始化，优先使用
  if (env.PROVIDER_REGISTRY) {
    const provider = env.PROVIDER_REGISTRY.resolveForRead(path);
    if (provider.type === 'github') {
      return (provider as GitHubProvider).toResolvedRepo();
    }
    // 非 GitHub provider 怎么办？需要 error 或 fallback
  }
  // 否则使用旧的 repoRouter 逻辑
  return legacyResolveForRead(path, env, waitUntil);
}
```

---

## 8. D1 Schema 扩展

```sql
-- 新增 providers 表
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,           -- 'github' | 's3' | 'googledrive'
    name TEXT NOT NULL,           -- 显示名称
    config TEXT NOT NULL,         -- JSON: 各 provider 特有的配置
    status TEXT NOT NULL DEFAULT 'active',  -- active, readonly, draining, archived
    capacity_limit_bytes INTEGER NOT NULL,
    used_bytes INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- paths 表扩展：增加 provider_id 字段
-- 注意：ALTER TABLE 需要手动执行，不对现有数据造成影响
-- ALTER TABLE paths ADD COLUMN provider_id TEXT;

-- 新表：paths_v2（可选，如果不想 ALTER 现有表）
CREATE TABLE IF NOT EXISTS path_providers (
    path TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    repo_id TEXT,                  -- 兼容旧数据
    size_bytes INTEGER,
    hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
);

-- 迁移数据：将现有 paths 数据复制到 path_providers
-- 需要先手动将 repos 数据转为 providers
-- INSERT INTO path_providers (path, provider_id, repo_id, size_bytes, hash, created_at)
-- SELECT p.path, r.id, p.repo_id, p.size_bytes, p.hash, p.created_at
-- FROM paths p JOIN repos r ON p.repo_id = r.id;

-- 索引
CREATE INDEX IF NOT EXISTS idx_path_providers_provider_id ON path_providers(provider_id);
```

---

## 9. 管理面板 UI 变更

### 9.1 Provider 管理页面

在现有 Settings 页面中增加 Provider 管理区域：

```
┌─────────────────────────────────────┐
│  Storage Providers                   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ GitHub · ID-VerNe/picbed    │    │
│  │ Active · 45MB / 5GB         │    │
│  │ [Edit] [Drain] [Archive]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Google Drive · My Photos    │    │
│  │ Active · 120MB / 15GB       │    │
│  │ [Edit] [OAuth] [Archive]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  [+] Add Provider                   │
└─────────────────────────────────────┘
```

### 9.2 上传选择器

上传时增加 Provider 选择下拉：

```
┌─────────────────────────────────┐
│  Upload to:                     │
│  ┌─ GitHub (ID-VerNe/picbed) ─┐ │
│  │ GitHub (ID-VerNe/picbed)    │ │
│  │ Google Drive (My Photos)    │ │
│  └─────────────────────────────┘ │
│  Target folder: /                │
│  [Choose File] [Upload]          │
└─────────────────────────────────┘
```

### 9.3 API 端点

```
GET    /admin/api/providers       — 列出所有 Provider
POST   /admin/api/providers       — 新增 Provider
PUT    /admin/api/providers/:id   — 编辑 Provider
DELETE /admin/api/providers/:id   — 删除 Provider
GET    /admin/api/providers/:id/usage — 使用统计
```

---

## 10. 实施步骤与依赖关系

```
Step 4.1 ──→ Step 4.2 ──→ Step 4.4 ──→ Step 4.5
    │                          │
    └────────── Step 4.3 ──────┘
                                      │
                                      ↓
                                  Step 4.6
                                      │
                                      ↓
                                  Step 4.7
```

| 步骤 | 内容 | 涉及文件 | 预估工作量 | 依赖 |
|------|------|---------|-----------|------|
| **4.1** | 新建 `src/providers/`，定义接口和类型 | `src/providers/types.ts` | 小（1 文件） | 无 |
| **4.2** | 实现 `GitHubProvider`（包装现有 githubService） | `src/providers/github/GitHubProvider.ts` | 中（1-2 文件） | 4.1 |
| **4.3** | 实现 `S3Provider`（fetch-based SigV4 签名） | `src/providers/s3/S3Provider.ts`, `src/providers/s3/sigv4.ts` | 中（2-3 文件） | 4.1 |
| **4.4** | 实现 `ProviderRegistry` + 重构路由逻辑 | `src/providers/registry.ts`, 修改 `src/services/repoRouter.ts` | 中（2-3 文件） | 4.2, 4.3 |
| **4.5** | D1 schema 扩展 + 数据迁移 | `scripts/schema.sql`, 迁移脚本 | 小 | 无 |
| **4.6** | 管理面板 UI：Provider 管理 + 上传选择器 | `src/routes/admin/api/providers.ts`, `partials.ts`, `scripts/` | 中（3-4 文件） | 4.4 |
| **4.7** | GoogleDriveProvider 调研 + 实现（含国内直连方案） | `src/providers/googledrive/GoogleDriveProvider.ts`, `src/providers/googledrive/oauth.ts` | 大（需要调研 OAuth 流程） | 4.1, OAuth 调研 |

### 实施优先级建议

| 批次 | 步骤 | 理由 |
|------|------|------|
| 🥇 **第一批** | 4.1 → 4.2 → 4.4 → 4.5 | 建立完整的基础设施，替换现有 GitHub 逻辑 |
| 🥈 **第二批** | 4.3 | 引入 S3/R2 支持，可与第一批并行 |
| 🥉 **第三批** | 4.6 | UI 改动依赖于底层就绪 |
| 🔬 **研究** | 4.7 | Google Drive 需要 OAuth 调研，独立进行 |

---

## 11. 文件结构

```
src/
├── providers/
│   ├── types.ts                  # StorageProvider 接口 + 所有类型定义
│   ├── registry.ts               # ProviderRegistry 注册表
│   ├── errors.ts                 # 类型化错误类
│   ├── conformance.ts            # 一致性测试运行器（参考 voyant）
│   │
│   ├── github/
│   │   ├── GitHubProvider.ts     # GitHub 实现
│   │   └── types.ts              # GitHubProviderSettings
│   │
│   ├── s3/
│   │   ├── S3Provider.ts         # S3 兼容实现
│   │   ├── sigv4.ts              # fetch-based SigV4 签名
│   │   └── types.ts              # S3ProviderSettings
│   │
│   ├── googledrive/
│   │   ├── GoogleDriveProvider.ts
│   │   ├── oauth.ts              # JWT/OAuth2 流程
│   │   └── types.ts              # GoogleDriveProviderSettings
│   │
│   └── memory/
│       └── MemoryProvider.ts     # 内存实现（测试用，参考 voyant memory provider）
│
├── services/
│   ├── repoRouter.ts             # ← 逐步迁移到 ProviderRegistry
│   └── providerRouter.ts         # 新：兼容层，包装 ProviderRegistry
│
└── routes/
    └── admin/
        └── api/
            └── providers.ts      # Provider 管理 API 端点
```

---

## 12. 迁移策略

### 阶段 1：并行运行（向后兼容）

```
现有的 repoRouter → 继续使用（不受影响）
新增 ProviderRegistry → 只在新代码中使用
```

### 阶段 2：GitHubProvider 包装

```
GitHubProvider 包装 githubService
repoRouter 内部使用 GitHubProvider 获取数据
对外接口不变（resolveForRead 仍返回 ResolvedRepo）
```

### 阶段 3：ProviderRegistry 取代 repoRouter

```
ProviderRegistry.loadFromD1() 取代 ensureCache()
resolveForRead/resolveForWrite 改为调用 ProviderRegistry
repoRouter 降级为兼容 shim
```

### 阶段 4：管理面板支持 Provider 选择

```
上传时选择 Provider
Provider 管理 CRUD
Provider 使用统计
```

### 回滚策略

每个阶段都有独立的 git commit，可以单独回滚：

```bash
# 如果 Phase 4 整体有问题
git revert HEAD~5..HEAD  # 回滚所有 Phase 4 提交
```

---

## 附录 A：与现有代码的接口对照

### 当前代码 → 新 Provider 映射

| 当前代码 | 新 Provider 方式 | 兼容层 |
|---------|----------------|--------|
| `githubService.fetchRaw(path, repo)` | `provider.getBytes(path)` 或 `provider.getStream(path)` | 在 GitHubProvider 内部调用 |
| `githubService.putFile(path, repo, content, msg)` | `provider.put(path, data, { message })` | 同上 |
| `githubService.deleteFile(path, repo, sha, msg)` | `provider.delete(path, sha)` | 同上 |
| `githubService.fileExists(path, repo)` | `provider.exists(path)` | 同上 |
| `githubService.getFile(path, repo)` | `provider.getFileInfo(path)` | 同上 |
| `githubService.getTree(repo, recursive)` | `provider.getTree(prefix, recursive)` | 同上 |
| `resolveForRead(path, env)` | `registry.resolveForRead(path)` | repoRouter 兼容层 |
| `resolveForWrite(env, bytes)` | `registry.resolveForWrite(bytes)` | repoRouter 兼容层 |
| `getTokenFromEnv(env, name)` | `GitHubProvider` 内部持有 token | 不暴露 |
| `dbService.recordFileAddition(db, path, repoId, size, hash)` | `registry.recordFileAddition(db, path, providerId, size, hash)` | 扩展字段 |
| `dbService.recordFileDeletion(db, path, repoId, size)` | `registry.recordFileDeletion(db, path, providerId, size)` | 扩展字段 |