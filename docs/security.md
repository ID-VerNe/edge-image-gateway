# 安全配置指南

## 概述

本项目采用七层纵深防御体系来保护图片资源的安全。所有安全模块均可独立启用/关闭，按需组合。

---

## 1. 防盗链（Referer Guard）

### 工作原理

检查请求头中的 `Referer` 或 `Origin` 字段，验证是否在域名白名单中。同时配合 `Sec-Fetch-Dest` 请求头校验，进一步过滤非浏览器请求。

### 配置方式

在 `wrangler.toml` 中设置：

```toml
[vars]
ALLOWED_REFERERS = "yourblog.com,another-site.com"
```

### 规则说明

- 多个域名用英文逗号分隔
- 支持通配符子域名：`*.yourblog.com`
- 域名不包含协议前缀（`http://` 或 `https://`）
- 空值表示禁用防盗链检查
- 支持 `Referer` 和 `Origin` 两种请求头

### 示例

```toml
# 允许主域名和所有子域名
ALLOWED_REFERERS = "example.com,*.example.com"

# 允许多个独立域名
ALLOWED_REFERERS = "blog.example.com,notes.example.org,forum.example.net"

# 关闭防盗链（不推荐在生产环境使用）
ALLOWED_REFERERS = ""
```

---

## 2. HMAC 签名验证

### 工作原理

对图片链接使用 HMAC-SHA256 算法生成带有效期的签名，防止 URL 被篡改或长期滥用。

### 签名生成算法

```
signature = HMAC-SHA256(
  key: SIGN_SECRET,
  message: path + "|" + expiry_timestamp
)
```

生成的签名链接格式：

```
https://img.example.com/path/to/image.png?sig={signature}&exp={expiry_timestamp}
```

### 使用签名生成脚本

```bash
npx tsx scripts/sign.ts /private/image.png 3600 YOUR_SIGN_SECRET
```

参数说明：
| 参数 | 说明 | 示例 |
|------|------|------|
| 路径 | 图片路径 | `/private/image.png` |
| 有效期 | 有效秒数 | `3600`（1小时） |
| 密钥 | 与 `SIGN_SECRET` 一致 | `your-secret-key` |

### 目录分级保护

以下路径强制要求签名验证，即使 Referer 在白名单中也不豁免：

| 路径前缀 | 用途 | 签名要求 |
|----------|------|----------|
| `/private/` | 私有图片 | 强制签名 |
| `/draft/` | 草稿图片 | 强制签名 |
| `/raw/` | 原始文件 | 强制签名 |

### 紧急熔断（Emergency Lockdown）

在极端情况下（如被爬虫攻击），可一键启用全站签名强制：

```toml
[vars]
EMERGENCY_LOCKDOWN = "true"
```

启用后效果：
- **所有请求**均需携带有效签名
- Referer 白名单不再生效
- 部署后约 30 秒内生效

---

## 3. 请求频率限制（Rate Limit）

### 工作原理

基于 `CF-Connecting-IP` 请求头追踪每个 IP 的请求频率，支持滑动窗口计数器。

### 配置

```toml
[vars]
RATE_LIMIT_PER_MIN = "120"
```

### 限制规则

| 限制类型 | 阈值 | 响应 |
|----------|------|------|
| 正常请求超限 | 超过 `RATE_LIMIT_PER_MIN` | `429 Too Many Requests` |
| 404 惩罚 | 每分钟超过 20 次 404 | `403 Forbidden`，封禁 5 分钟 |

### 404 惩罚机制

此机制专门用于防御字典遍历攻击（攻击者尝试猜测文件名）：

1. 每个 IP 维持一个 404 计数器
2. 1 分钟内累计 20+ 次 404 请求
3. 该 IP 被自动封禁 5 分钟（返回 403）
4. 封禁期结束自动恢复

---

## 4. 响应脱敏

### 自动剥离的响应头

Worker 在返回图片响应时会自动删除以下响应头：

| 响应头 | 原因 |
|--------|------|
| `X-GitHub-*` | 暴露后端存储信息 |
| `Server` | 暴露服务器类型 |
| `Set-Cookie` | 防止 Cookie 泄漏 |
| `X-Powered-By` | 暴露技术栈信息 |
| `X-Runtime` | 暴露框架信息 |

---

## 5. 路径安全

### 路径穿越防护

所有请求路径都会被检查是否包含 `..` 序列：

```typescript
// 以下路径将被拒绝
/../../etc/passwd
/images/../../../secrets
/..%2F..%2Fprivate-key
```

---

## 6. 管理员认证

### 认证方式

管理后台使用 Cloudflare Access 认证：

1. 请求到达 `/admin/*` 路由
2. 检查 `Cf-Access-Authenticated-User-Email` 请求头
3. 如果未认证，重定向到 Cloudflare Access 登录页面
4. 认证通过后设置 Session Cookie，有效期为 24 小时

### 配置要求

需要在 Cloudflare Dashboard 中配置 Access 应用：
1. 导航到 Zero Trust → Access → Applications
2. 添加一个新应用，类型为 Self-hosted
3. 设置应用域名为您的 Worker 域名
4. 配置访问策略（如：仅允许特定邮箱或邮箱域名）

---

## 7. 最佳实践

### 推荐配置组合

| 场景 | 推荐配置 |
|------|----------|
| 个人博客 | 防盗链 + 限流 |
| 公开分享 | 防盗链 + 限流 + 签名 |
| 私有存储 | 全部启用 |
| 被攻击中 | 启用紧急熔断 |

### 安全清单

- [ ] `GITHUB_TOKEN` 使用最小权限（仅限存储仓库）
- [ ] `SIGN_SECRET` 使用强随机密码
- [ ] 配置合理的 `ALLOWED_REFERERS`
- [ ] 启用限流保护
- [ ] 敏感图片放在 `/private/` 目录下
- [ ] 定期轮换 Token 和 Secret
- [ ] 不要在代码中硬编码任何凭据

### 监控建议

在 Cloudflare Dashboard 中关注：
- 429/403 响应比例（可能表示攻击）
- Worker 调用次数
- GitHub API 调用频率
- 缓存命中率

---

## 参考文档

- [配置参考](./configuration.md) — 环境变量和 Secrets 详细说明
- [架构详解](./architecture.md) — 安全模块在请求流程中的位置
- [部署指南](./deployment.md) — Cloudflare Access 配置步骤
- [多仓库路由](./multi-repo.md) — 多仓库架构下的安全注意事项