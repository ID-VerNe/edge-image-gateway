# 管理面板

## 概览

Edge Image Gateway 内置了一个完整的 Web 管理面板，提供文件管理、仓库管理、审计日志、API 令牌管理等功能。管理面板以单页应用（SPA）的形式集成在 Worker 中，无需单独部署任何前端服务。

**访问地址：**

```
https://{你的域名}/admin
```

---

## 认证

管理面板支持两种认证方式，可在部署时按需选择。

### 方式一：Cloudflare Access（推荐）

适用于已配置 Cloudflare Zero Trust 的场景，安全性最高。

**配置步骤：**

1. 登录 [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. 进入 **Access → Applications**，点击 **Add an application**
3. 选择 **Self-hosted**，设置应用名称
4. 在 **Application domain** 中填入 Worker 域名，路径设为 `/admin`
5. 在 **Identity providers** 中选择接受的登录方式（GitHub / Google / Email OTP 等）
6. 在 **Policies** 中创建策略，定义允许访问的管理员（按邮箱、邮箱后缀或身份提供商）
7. 在 `wrangler.toml` 中设置 `ADMIN_EMAILS` 白名单作为额外防护

**验证流程：**

1. 用户访问 `/admin`
2. Cloudflare Access 拦截请求，重定向到登录页面
3. 用户完成身份验证后，Access 在请求头中添加 `Cf-Access-Authenticated-User-Email`
4. Worker 中间件验证该邮箱是否在 `ADMIN_EMAILS` 白名单中
5. 验证通过后，显示管理面板

### 方式二：TOTP 双因素认证

适用于无需配置 Zero Trust 的轻量场景。

**配置步骤：**

1. 生成 TOTP 密钥：

```powershell
# 使用 Node.js 生成随机密钥
node -e "console.log(require('crypto').randomBytes(20).toString('hex'))"
```

2. 将生成的密钥设置为 Secret：

```bash
npx wrangler secret put ADMIN_TOTP_SECRET
```

3. 将密钥添加到 Authenticator App（如 Google Authenticator、Authy、1Password 等）：
   - 手动输入密钥，或生成二维码后扫码添加
   - 算法选择 SHA1，6 位数字，30 秒周期

4. 部署后访问 `/admin`，页面会提示输入 6 位 TOTP 验证码

**注意事项：**

- 每个验证码有效期为 30 秒
- 连续 3 次验证失败后会有 1 秒延迟
- 验证成功后会设置一个短期 Cookie，无需重复输入
- 请妥善保管 TOTP 密钥，丢失后需重新设置

---

## 功能模块

管理面板采用 Hash 路由实现单页应用，包含以下功能视图。

### 1. 文件浏览

**视图标识：** `#main-files`

文件浏览器是管理面板的默认视图，提供完整的文件管理能力。

**核心功能：**

| 功能 | 操作方式 | 说明 |
|------|----------|------|
| 目录树导航 | 左侧边栏点击 | 支持展开/折叠，点击切换目录 |
| 文件预览 | 点击文件名 | 右侧滑出预览面板，显示面包屑、文件信息、分享链接生成 |
| 网格/列表切换 | 右上角按钮 | 切换文件显示模式 |
| 搜索过滤 | 顶部搜索框 | 按文件名关键词实时过滤当前目录 |
| 批量选择 | Ctrl/Shift + 点击 | 多选后进行批量删除、移动 |
| 上传文件 | 拖拽或点击"添加文件" | 上传到当前目录，支持多文件 |
| 新建文件夹 | 点击"新建文件夹" | 在当前目录下创建子目录 |
| 删除确认 | 二次确认弹窗 | 删除操作需二次确认，记录审计日志 |

**直接访问路径：**

```
/admin#main-files
/admin#main-files?path=/images/2025
```

### 2. 审计日志

**视图标识：** `#main-audit`

审计日志记录所有敏感操作，提供完整的操作追溯能力。

**审计事件类型：**

| 事件类型 | 说明 | 记录信息 |
|----------|------|----------|
| `UPLOAD_FILE` | 文件上传 | 路径、大小、目标仓库 |
| `DELETE_FILE` | 文件删除 | 路径、仓库、SHA |
| `DELETE_DIR` | 目录删除 | 路径、仓库、文件数量 |
| `MKDIR` | 创建目录 | 路径、仓库 |
| `MOVE_FILE` | 文件移动/重命名 | 源路径、目标路径 |
| `GENERATE_TOKEN` | 生成 API 令牌 | 令牌名称、前缀 |
| `REVOKE_TOKEN` | 吊销 API 令牌 | 令牌 ID、名称 |
| `ADD_REPO` | 添加仓库 | 仓库 ID、所有者 |
| `UPDATE_REPO` | 更新仓库配置 | 仓库 ID、变更字段 |
| `REMOVE_REPO` | 移除仓库 | 仓库 ID |
| `SET_WRITE_TARGET` | 切换写目标 | 旧仓库 → 新仓库 |
| `SYNC_REPO` | 同步仓库统计 | 仓库 ID、同步结果 |

**日志格式：**

```json
{
  "timestamp": "2025-06-01T12:00:00.000Z",
  "action": "DELETE_FILE",
  "actor": "admin@example.com",
  "details": {
    "path": "/images/photo.jpg",
    "repo": "repo-main",
    "sha": "abc123def456"
  },
  "ip": "203.0.113.1",
  "userAgent": "Mozilla/5.0..."
}
```

**访问路径：**

```
/admin#main-audit
```

### 3. API 令牌管理

**视图标识：** `#main-tokens`

用于管理程序化 API 访问的令牌。

**功能：**

- **令牌列表** — 展示所有已生成的令牌（名称、前缀、创建时间、状态）
- **生成令牌** — 输入名称生成新令牌，完整令牌值仅显示一次
- **吊销令牌** — 吊销不再使用的令牌，立即生效

**使用方式：**

```bash
# 在 API 请求中使用令牌
curl https://{你的域名}/admin/api/files \
  -H "Authorization: Bearer <你的API令牌>"
```

> **重要：** 令牌生成后仅显示一次，关闭弹窗后无法再次查看。请立即复制并妥善保管。

**访问路径：**

```
/admin#main-tokens
```

### 4. 系统设置与仓库管理

**视图标识：** `#main-repos`

整合了统计面板和仓库管理功能。

**统计面板：**

| 指标 | 说明 |
|------|------|
| 仓库总数 | 已注册的 GitHub 仓库数量 |
| 图片总数 | 所有仓库中的文件总数 |
| 已用存储 | 所有仓库的总存储用量（可读格式） |

**仓库管理：**

| 操作 | 说明 |
|------|------|
| 添加仓库 | 注册新的 GitHub 仓库（owner、name、branch、Token、容量上限） |
| 编辑仓库 | 修改仓库配置（状态、容量上限、Token 引用） |
| 设置写目标 | 选择当前活跃的写入目标仓库 |
| 同步统计 | 手动从 GitHub 同步仓库的实际使用情况 |
| 删除仓库 | 注销仓库（仅在 `draining` 状态下可删除） |

**仓库状态说明：**

| 状态 | 读 | 写 | 说明 |
|------|----|----|------|
| `active` | ✓ | ✓ | 正常读写，参与自动写路由 |
| `readonly` | ✓ | ✗ | 仅可读取，用于归档旧数据 |
| `draining` | ✓ | ✗ | 迁移中，数据尚未清理，可删除 |
| `archived` | ✗ | ✗ | 已归档，不出现在路由选择中 |

**访问路径：**

```
/admin#main-repos
```

---

## 前端技术实现

管理面板与 Worker 后端集成在同一代码库中，无需单独部署。

**技术细节：**

| 方面 | 实现方式 |
|------|----------|
| 架构 | 单页应用（SPA），通过 Hash 路由切换视图 |
| 样式 | 内联 CSS（通过 `styles.ts` 注入），无外部依赖 |
| 脚本 | 原生 JavaScript（通过 `scripts.ts` 注入），模块化组织 |
| 渲染 | 模板引擎（`render.ts`），动态生成 HTML |
| 状态管理 | 全局状态对象（`state.ts`），各视图独立管理 |
| API 通信 | Fetch API，TOTP 模式使用 `Authorization` Header，Access 模式自动携带 Cookie |
| 响应式 | 适配桌面端和移动端，使用 CSS Grid 和 Flexbox |

**前端模块结构：**

```
src/routes/admin/scripts/
├── state.ts          # 全局状态管理
├── render.ts         # 模板渲染引擎
├── navigation.ts     # 路由导航与 Hash 监听
├── events.ts         # 事件委托与绑定
├── actions.ts        # 操作聚合入口
├── selection.ts      # 文件选择逻辑
├── utils.ts          # 工具函数
└── actions/
    ├── fileActions.ts   # 文件操作（上传、删除、移动、列表）
    ├── repoActions.ts   # 仓库操作（CRUD、同步、写目标）
    ├── shareActions.ts  # 分享链接操作
    └── tokenActions.ts  # API 令牌操作
```

---

## 安全注意事项

1. **始终配置认证** — 不要将管理面板直接暴露在公网，必须配置 Access 或 TOTP 认证
2. **Access 会话过期** — 建议将会话过期时间设置为 24 小时以内
3. **定期审查审计日志** — 关注异常管理操作，及时发现问题
4. **IP 限制** — 生产环境建议通过 Cloudflare WAF 规则限制 `/admin` 路径的访问 IP 范围
5. **删除操作不可恢复** — 请在删除前确认文件不再需要，删除的文件无法恢复
6. **令牌管理** — 定期轮换 API 令牌，吊销不再使用的令牌
7. **TOTP 密钥备份** — 妥善保管 TOTP 密钥，建议使用密码管理器存储