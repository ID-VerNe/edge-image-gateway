# 管理后台指南

## 概述

管理后台提供图形化界面，用于管理图片文件、注册仓库和查看统计信息。访问路径为 `/admin`。

---

## 访问方式

### 1. 认证流程

管理后台使用 Cloudflare Access 进行身份认证：

1. 在浏览器中访问 `https://{your-domain}/admin`
2. 自动跳转到 Cloudflare Access 登录页面
3. 使用配置的认证方式登录（如 Google、GitHub OAuth 等）
4. 登录成功后设置 Session Cookie，有效期 24 小时
5. 后续请求自动携带 Cookie，无需重复登录

### 2. 配置 Cloudflare Access

需要在 Cloudflare Zero Trust Dashboard 中配置：

1. 导航到 Zero Trust → Access → Applications
2. 点击 "Add an application"，选择 "Self-hosted"
3. 配置应用信息：
   - Application domain: `{your-worker-domain}`
   - Subdomain: 留空
   - Path: `/admin`
4. 配置策略（Policy）：
   - 规则示例：邮箱后缀 `@yourdomain.com`
5. 保存配置

---

## 功能说明

### 文件浏览器

**访问路径**：`/admin`

提供两种视图模式：

#### 列表视图
- 文件名、大小、最后修改时间
- 按名称或时间排序
- 文件类型图标标识

#### 网格视图
- 图片文件显示缩略图
- 文件名标签
- 适合浏览图片内容

#### 操作按钮
| 操作 | 说明 |
|------|------|
| 刷新 | 重新加载当前目录内容 |
| 上传 | 打开文件上传窗口 |
| 新建文件夹 | 在当前目录创建新文件夹 |
| 删除 | 删除选中的文件/文件夹 |
| 移动 | 将选中的文件移动到其他目录 |

#### 目录导航
- 面包屑导航显示当前路径
- 左侧目录树（仅多仓库模式）
- 支持点击进入子目录

### 文件上传

**上传方式**：
- **拖拽上传**：将文件拖拽到上传区域
- **点选上传**：点击上传按钮选择文件

**上传特性**：
- 支持批量上传
- 自动检测文件名冲突（同名文件提示去重）
- 上传进度反馈
- 上传完成后自动刷新文件列表

**支持的文件类型**：
- 图片：PNG、JPEG、WebP、AVIF、GIF、SVG、ICO、BMP、TIFF
- 视频：MP4、WebM
- 其他：PDF、ZIP 等

### 文件操作

#### 删除文件
1. 选中需要删除的文件
2. 点击删除按钮
3. 确认删除操作
4. 通过 GitHub API 从仓库中移除

#### 移动文件
1. 选中需要移动的文件
2. 点击移动按钮
3. 选择目标目录
4. 确认移动操作
5. Worker 执行 GitHub API 的移动（先复制后删除）

#### 新建文件夹
1. 点击新建文件夹按钮
2. 输入文件夹名称
3. 确认创建
4. 在 GitHub 仓库中创建 `.gitkeep` 文件以保持目录存在

### 多选操作

- 点击文件前的复选框进行选择
- 支持 Shift 键范围选择
- 支持 Ctrl/Command 键多选
- 全选/取消全选切换

---

## 仓库管理

### 仓库列表

显示所有已注册的仓库信息：

| 字段 | 说明 |
|------|------|
| 仓库 ID | 唯一标识符 |
| 所有者 | GitHub 用户名 |
| 仓库名 | GitHub 仓库名称 |
| 状态 | active / readonly / draining / archived |
| 存储用量 | 当前已使用容量 |
| 容量限制 | 最大容量 |

### 添加仓库

通过 API 注册新仓库：

```http
POST /admin/api/repos
Content-Type: application/json

{
  "id": "my-new-repo",
  "owner": "github-username",
  "name": "new-storage-repo",
  "branch": "main",
  "capacityLimitBytes": 5368709120,
  "tokenSecretName": "GITHUB_TOKEN"
}
```

### 仓库状态

| 状态 | 说明 | 可读 | 可写 |
|------|------|------|------|
| `active` | 正常状态 | 是 | 是 |
| `readonly` | 只读，停止写入 | 是 | 否 |
| `draining` | 正在排空 | 是 | 否 |
| `archived` | 归档 | 否 | 否 |

### 切换写仓库

上传的文件会写入当前指定的写仓库。可通过 API 切换：

```http
POST /admin/api/repos/route/write
Content-Type: application/json

{
  "repo": "target-repo-id"
}
```

---

## 统计面板

访问路径：`/admin` 首页

### 展示信息

- **仓库数量**：已注册的仓库总数
- **文件数量**：所有仓库的文件总数
- **存储总量**：所有仓库的使用容量总和
- **各仓库使用率**：每个仓库的容量使用百分比

### 缓存管理

点击"刷新缓存"按钮可请求清除边缘缓存：

```http
POST /admin/api/stats/cache/purge
```

注意：Workers Cache API 是基于区域（colocation-specific）的，缓存清除可能需要一定时间才能在全球范围生效。

---

## 前端技术说明

### 技术栈

- **纯原生 JavaScript**：无前端框架依赖
- **HTML 模板字符串**：在 Worker 端拼接渲染
- **Inter 字体**：类 GitHub 风格界面
- **CSS 变量**：支持主题定制

### 模块结构

```
src/routes/admin/scripts/
├── state.ts        # 应用状态管理（当前仓库、路径、视图模式）
├── utils.ts        # 工具函数（API 请求、DOM 操作）
├── navigation.ts   # 导航与目录树渲染
├── render.ts       # 文件列表渲染（列表/网格视图）
├── selection.ts    # 多选逻辑管理
├── actions.ts      # 文件操作（上传、删除、移动）
└── events.ts       # 事件绑定与处理
```

### 主题定制

默认使用 GitHub 风格的配色方案。如需自定义，可修改 [styles.ts](../src/routes/admin/styles.ts) 中的 CSS 变量。

---

## 相关文档

- [API 参考](./api-reference.md) — 管理后台 API 详细说明
- [安全指南](./security.md) — Cloudflare Access 认证配置
- [多仓库路由](./multi-repo.md) — 多仓库管理
- [架构详解](./architecture.md) — 前端模块与后端的数据流