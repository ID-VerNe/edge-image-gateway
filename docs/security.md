# 安全指南

## 安全架构

Edge Image Gateway 采用多层安全防护体系，覆盖访问控制、传输安全、运行时安全等多个维度。

```
                       请求入口
                           │
              ┌────────────▼────────────┐
              │  L1: 速率限制 (IP级)     │
              │  - 令牌桶算法            │
              │  - 可配置阈值            │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  L2: 防盗链 (Referer)    │
              │  - 白名单模式            │
              │  - 可配置允许列表         │
              │  - 分享链接自动跳过       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────────┐
              │  L3: 签名认证 + 紧急熔断检查  │
              │  - HMAC-SHA256 签名         │
              │  - 时间戳防重放（5 分钟窗口） │
              │  - 熔断开关 → 拒绝写操作     │
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────┐
              │  L4: 管理员认证           │
              │  - Cloudflare Access    │
              │  - 或 TOTP 双因素        │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  L5: 响应安全头          │
              │  - 防嗅探头 (nosniff)   │
              └─────────────────────────┘
```

---

## 1. 速率限制

系统对每个 IP 地址实施独立的速率限制，防止滥用。

**实现方式**：令牌桶算法，在 Workers 内存中维护每个 IP 的令牌计数。

**配置**：

```toml
# wrangler.toml
[vars]
RATE_LIMIT_PER_MIN = "100"   # 每分钟每 IP 最大请求数
```

**行为**：
- 超限后返回 `HTTP 429 Too Many Requests`
- 响应包含 `Retry-After` 头，指示客户端何时可重试
- 限制按 IP 独立计数，不受共享 IP（如 NAT）影响

---

## 2. 紧急熔断

紧急熔断机制提供了一键关闭所有写操作的能力，用于应对安全事件或异常流量。

**触发方式**：

- **管理面板** — 在系统设置中一键开关
- **KV 直接操作** — `kv_config::emergency_lockdown = "true"`
- **环境变量** — `EMERGENCY_LOCKDOWN = "true"`（部署后立即生效）

**效果**：
- 所有 `POST`、`PUT`、`DELETE`、`PATCH` 请求返回 `HTTP 503 Service Unavailable`
- 读操作（`GET`）不受影响
- 解除方法：将开关设回 `"false"`

---

## 3. 防盗链

通过验证请求的 `Referer` 头来防止图片被第三方站点盗用。

**配置**：

```toml
[vars]
ALLOWED_REFERERS = "https://example.com,https://blog.example.com"
```

**规则**：
- 支持通配符匹配（`https://*.example.com`）
- 空 Referer 的请求（如直接浏览器访问、App 请求）默认允许
- 多个域名用逗号分隔
- 设为空字符串时，只允许空 Referer 的请求
- 不设置时默认为 `*`（允许所有）

**分享链接绕过**：带有效 `__share_sig` 签名的请求自动跳过防盗链检查。

---

## 4. 签名认证

所有写操作（上传、删除）和分享链接支持 HMAC 签名认证。

### 签名生成

```typescript
import { createHmac } from "node:crypto";

function generateSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  body?: string
): string {
  const message = `${method}\n${path}\n${timestamp}${body ? `\n${body}` : ""}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}
```

### 请求签名

```
POST /upload
X-Signature: <hex-encoded-hmac>
X-Timestamp: 1717200000
```

### 验证规则

1. 验证 `X-Timestamp` 与当前时间的差距不超过 300 秒（5 分钟容忍窗口）
2. 使用 `SIGN_SECRET` 和请求参数重新计算签名
3. 比较计算签名与请求签名的十六进制字符串是否相同（使用恒定时间比较）
4. 验证通过后，将签名参数从请求中移除，继续处理

### 分享链接签名

```
GET /share/images/photo.jpg?expires=1717200000
```

签名在 URL 中：重定向到 `/images/photo.jpg?__share_sig=xxx&__share_exp=1717200000`

---

## 5. 管理员认证

管理面板采用双认证方案：

### Cloudflare Access (Zero Trust)

- 用户访问 `/admin` 时重定向到 Cloudflare Access 登录页面
- 登录成功后 Cloudflare 添加 `Cf-Access-Authenticated-User-Email` 请求头
- Worker 验证该邮箱是否在 `ADMIN_EMAILS` 白名单中
- 额外的签名验证确保 Access Token 未被篡改

### TOTP 双因素认证

- 适用于无需配置 Zero Trust 的场景
- 基于时间的一次性密码（RFC 6238）
- 密钥通过 `ADMIN_TOTP_SECRET` Secret 设置
- 用户通过 Authenticator App 获取 6 位验证码
- 每个验证码有效期 30 秒，3 次失败后延迟 1 秒

---

## 6. 响应安全

### 响应头清洗

系统自动从上游 GitHub API 响应中移除以下敏感头：

- `x-github-*`（请求 ID、认证信息等）
- `x-ratelimit-*`（速率限制详情）
- `set-cookie`（如有）
- `access-control-allow-origin`（如有）

### 安全响应头

对所有响应添加以下安全头：

```
Content-Security-Policy: default-src 'self'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer-when-downgrade
```

---

## 7. GitHub Token 安全

- GitHub Token 通过环境变量 Secret 设置，不在代码中硬编码
- Token 需要最小的必要权限（Contents 读+写，指定仓库）
- 支持使用 Fine-grained Token，将权限限定到具体仓库
- 建议定期轮换 Token（每 90 天）

### Token 泄露响应流程

1. **检测** — 通过审计日志或 GitHub 告警发现异常 API 调用
2. **熔断** — 开启紧急熔断，阻止进一步写入
3. **撤销** — 在 GitHub Settings 中立即撤销泄露的 Token
4. **轮换** — 生成新 Token，通过 `wrangler secret put` 更新
5. **审计** — 检查审计日志，确认是否有未授权的数据访问

---

## 8. 审计日志

所有敏感操作都记录到 KV 审计日志，不可篡改。

**记录的操作**：

- 文件上传（文件路径、大小、仓库）
- 文件删除（文件路径、仓库、操作人）
- 仓库变更（创建、更新、删除）
- 配置变更（熔断开关、速率限制等）
- 管理员登录

**日志格式**：

```json
{
  "timestamp": "2025-06-01T12:00:00.000Z",
  "action": "file_delete",
  "actor": "admin@example.com",
  "details": {
    "path": "/images/photo.jpg",
    "repo": "main",
    "sha": "abc123"
  },
  "ip": "203.0.113.1",
  "userAgent": "Mozilla/5.0..."
}
```

**保留策略**：审计日志默认保留 90 天，可通过管理面板导出后删除。

---

## 9. 最佳实践

### 部署前安全清单

- [ ] GitHub Token 使用 Fine-grained 权限，仅限必要仓库
- [ ] `SIGN_SECRET` 使用强随机字符串（至少 32 字节）
- [ ] 已配置防盗链白名单
- [ ] 已启用签名认证（`ENABLE_SIGNATURE=true`）
- [ ] 已配置速率限制
- [ ] 管理面板已启用认证
- [ ] 自定义域名已启用 HTTPS
- [ ] 删除了代码中的任何测试密钥或凭证

### 运维安全

- 定期轮换 GitHub Token 和 SIGN_SECRET
- 定期审查审计日志
- 保持 wrangler 和依赖包更新
- 监控 GitHub API 使用量，避免超限
- 配置 Cloudflare WAF 规则，限制管理路径的访问 IP

### 紧急响应

1. 发现异常 → 开启紧急熔断
2. 审查审计日志
3. 轮换泄露的密钥
4. 分析根因
5. 解除熔断（确认安全后）