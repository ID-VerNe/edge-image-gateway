# 管理面板

## 概览

Edge Image Gateway 内置了一个完整的 Web 管理面板，提供文件管理、仓库管理、审计日志等功能。

管理面板访问地址：

```
https://{your-worker-domain}/admin
```

---

## 认证

管理面板支持两种认证方式：

### 方式一：Cloudflare Access（推荐）

1. 在 Cloudflare Zero Trust Dashboard 中创建 Access Application
2. 设置应用域名为 Worker 域名，路径为 `/admin`
3. 添加 Access Policy（按邮箱、邮箱后缀、或任何身份提供商）
4. 在 `wrangler.toml` 中设置 `ADMIN_EMAILS` 白名单

验证流程：
1. 用户访问 `/admin`
2. 重定向到 Cloudflare Access 登录页
3. 登录成功后，Access 添加 `Cf-Access-Authenticated-User-Email` 请求头
4. Worker 验证邮箱是否在白名单中

### 方式二：TOTP 双因素认证

1. 生成 TOTP 密钥：

```powershell
# PowerShell
npx tsx -e "const c=require('crypto');console.log(c.randomBytes(20).toString('hex'))"

# 或使用 WSL
wsl openssl rand -hex 20
```

2. 设置密钥：`npx wrangler secret put ADMIN_TOTP_SECRET`
3. 部署后访问 `/admin`，页面会提示输入 6 位 TOTP 验证码
4. 可使用 Google Authenticator / Authy / 1Password 等 App 添加密钥

---

## 功能模块

管理面板采用 Hash 路由实现单页应用，包含以下 5 个视图：

### 1. 文件浏览

**视图标识：** `#main-files`

文件浏览器是管理面板的默认视图，支持：

- **目录树导航** — 左侧目录树，支持展开/折叠，点击切换目录
- **文件预览** — 点击文件打开预览侧边栏（面包屑导航、分享链接生成、下载）
- **网格/列表切换** — 右上角切换文件显示模式
- **搜索过滤** — 按文件名关键词搜索当前目录
- **批量操作** — 选中多个文件后进行批量删除
- **新文件上传** — 点击"添加文件"按钮上传到当前目录
- **新建文件夹** — 在当前目录下创建子目录
- **删除确认** — 删除操作需二次确认，并记录审计日志

操作路径：

```
/admin#main-files

或者直接访问:
/admin#main-files?path=/images/2025
```

### 2. 回收站

**视图标识：** `#main-trash`

回收站页面展示所有已删除的文件记录：

- **删除文件列表** — 已删除文件的路径和操作时间
- **清空回收站** — 一键清空所有删除记录

> 回收站仅记录删除操作的元数据（路径、时间等），不保留文件内容本身。

操作路径：

```
/admin#main-trash
```

### 3. 审计日志

**视图标识：** `#main-audit`

审计日志页面提供所有敏感操作的可追溯记录：

- **操作记录** — 事件类型、路径、时间、操作人
- **刷新** — 手动刷新最新日志

审计事件包括：

| 事件类型 | 说明 |
|----------|------|
| `UPLOAD_FILE` | 文件上传 |
| `DELETE_FILE` | 文件删除 |
| `DELETE_DIR` | 目录删除 |
| `MKDIR` | 创建目录 |
| `MOVE_FILE` | 文件移动 |
| `GENERATE_TOKEN` | 生成 API 令牌 |
| `REVOKE_TOKEN` | 吊销 API 令牌 |
| `ADD_REPO` | 添加仓库 |
| `UPDATE_REPO` | 更新仓库配置 |
| `REMOVE_REPO` | 移除仓库 |
| `SET_WRITE_TARGET` | 设置写目标 |
| `SYNC_REPO` | 同步仓库统计 |
| `TRASH_EMPTY` | 清空回收站 |

操作路径：

```
/admin#main-audit
```

### 4. API 令牌

**视图标识：** `#main-tokens`

API 令牌页面用于管理用于程序化访问的令牌：

- **令牌列表** — 展示所有已生成的令牌（名称、前缀、创建时间、状态）
- **生成新令牌** — 输入名称生成新令牌，关闭弹窗前复制令牌值
- **吊销令牌** — 吊销不再使用的令牌

令牌生成后显示一次，关闭弹窗后将无法再次查看。

操作路径：

```
/admin#main-tokens
```

### 5. 系统设置与仓库管理

**视图标识：** `#main-repos`

此页面整合了统计面板和仓库管理功能：

**统计面板：**
- **仓库总数** — 已注册的 GitHub 仓库数量
- **图片总数** — 所有仓库中的文件总数
- **已用存储** — 所有仓库的总存储用量

**仓库管理：**
- **仓库列表** — 展示所有已注册的仓库及其状态
- **添加仓库** — 注册新的 GitHub 仓库（填写 owner、name、分支、Token、容量上限等）
- **编辑仓库** — 修改仓库配置（状态、容量上限等）
- **设置写目标** — 选择当前活跃的写入目标仓库
- **同步统计** — 手动从 GitHub 同步仓库的实际使用情况
- **删除仓库** — 注销仓库（仅在 `draining` 状态下可删除）

**仓库状态说明**

| 状态 | 读 | 写 | 说明 |
|------|----|----|------|
| `active` | ✓ | ✓ | 正常读写 |
| `readonly` | ✓ | ✗ | 仅可读取，用于归档 |
| `draining` | ✓ | ✗ | 迁移中，数据尚未清理 |
| `archived` | ✗ | ✗ | 已归档 |

操作路径：

```
/admin#main-repos
```

---

## 前端实现

管理面板前端使用静态 HTML + CSS + JavaScript 构建，集成在 Worker 中，无需单独部署。

### 技术细节

- **单页应用** — 所有页面在同一 HTML 中通过 Hash 路由切换
- **API 通信** — 使用 Fetch API 调用管理后端接口
- **认证令牌** — TOTP 模式使用 `Authorization` Header，Access 模式自动携带 Cookie
- **响应式** — 适配桌面端和移动端

### 前端文件结构

- `src/routes/admin.ts` — 管理面板入口，定义路由和子应用
- `src/routes/admin/partials.ts` — 各视图的 HTML 模板
- `src/routes/admin/styles.ts` — 内联 CSS 样式
- `src/routes/admin/scripts.ts` — 主 JavaScript 入口
- `src/routes/admin/scripts/navigation.ts` — Hash 路由导航
- `src/routes/admin/scripts/state.ts` — 应用状态管理
- `src/routes/admin/scripts/events.ts` — 事件处理
- `src/routes/admin/scripts/selection.ts` — 文件选择逻辑
- `src/routes/admin/scripts/utils.ts` — 工具函数
- `src/routes/admin/scripts/actions/` — 各模块操作逻辑
- `src/routes/admin/api/` — 后端 API 路由

---

## 安全注意事项

1. 始终为管理面板配置认证（Access 或 TOTP），不要直接暴露
2. 如果使用 Access，确保 Access Application 的会话过期时间合理（建议 24 小时）
3. 定期审查审计日志，关注异常管理操作
4. 生产环境中建议限制 `/admin` 路径的访问 IP 范围（配合 Cloudflare WAF 规则）
5. 删除操作不可恢复，请在删除前确认文件不再需要
