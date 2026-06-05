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
- 限制按 IP 独立计数，不受共享 IP 影响

**设计考量**：
- Workers 无状态，令牌桶数据存储在实例内存中，不同边缘节点独立计数
- 这意味着在极端情况下，同一 IP 可能在不同边缘节点获得不同配额
- 对于大多数场景，这种分布式限流已足够有效

---

## 2. 紧急熔断

紧急熔断机制提供了一键关闭所有写操作的能力，用于应对安全事件或异常流量。

**触发方式**：

| 方式 | 操作 | 生效速度 |
|------|------|----------|
| 管理面板 | 在系统设置中一键开关 | 即时（更新 KV） |
| KV 直接操作 | `kv_config::emergency_lockdown = "true"` | 即时 |
| 环境变量 | `EMERGENCY_LOCKDOWN = "true"` | 下次部署生效 |

**熔断效果**：
- 所有 `POST`、`PUT`、`DELETE`、`PATCH` 请求返回 `HTTP 503 Service Unavailable`
- 读操作（`GET`、`HEAD`）不受影响
- 解除方法：将开关设回 `"false"`

**使用场景**：
- 检测到异常的大量上传请求
- GitHub Token 疑似泄露
- 需要进行紧急维护

---

## 3. 防盗链

通过验证请求的 `Referer` 头来防止图片被第三方站点盗用。

**配置**：

```toml
[vars]
ALLOWED_REFERERS = "https://example.com,https://blog.example.com"
```

**规则**：

| 场景 | 行为 |
|------|------|
| Referer 在白名单中 | 允许访问 |
| Referer 不在白名单中 | 返回 403 Forbidden |
| 空 Referer（直接访问） | 默认允许 |
| 通配符匹配 | 支持 `https://*.example.com` |
| 配置为空字符串 `""` | 仅允许空 Referer 请求 |
| 未配置此变量 | 默认允许所有 |

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
3. 比较计算签名与请求签名的十六进制字符串是否相同（使用恒定时间比较，防止时序攻击）
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
6. **恢复** — 确认安全后解除熔断

---

## 8. 审计日志

所有敏感操作都记录到 KV 审计日志，不可篡改。

**记录的操作**：

| 操作类型 | 记录内容 |
|----------|----------|
| 文件上传 | 文件路径、大小、目标仓库 |
| 文件删除 | 文件路径、仓库、SHA、操作人 |
| 目录删除 | 路径、仓库、文件数量 |
| 仓库变更 | 创建、更新、删除仓库的详细信息 |
| 配置变更 | 熔断开关、速率限制等变更 |
| 管理员登录 | 登录时间、认证方式 |

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

**保留策略**：审计日志默认保留 90 天，可通过管理面板查看和导出。

---

## 9. 最佳实践

### 部署前安全清单

- [ ] GitHub Token 使用 Fine-grained 权限，仅限必要仓库
- [ ] `SIGN_SECRET` 使用强随机字符串（至少 32 字节）
- [ ] 已配置防盗链白名单
- [ ] 已启用签名认证（`ENABLE_SIGNATURE=true`）
- [ ] 已配置速率限制
- [ ] 管理面板已启用认证（Access 或 TOTP）
- [ ] 自定义域名已启用 HTTPS
- [ ] 删除了代码中的任何测试密钥或凭证
- [ ] `.dev.vars` 和 `.env` 文件已加入 `.gitignore`（如使用）

### 运维安全

| 任务 | 频率 | 说明 |
|------|------|------|
| 轮换 GitHub Token | 每 90 天 | 在 GitHub Settings 中重新生成 |
| 轮换 SIGN_SECRET | 每 180 天 | 更新后需重新生成分享链接 |
| 审查审计日志 | 每周 | 关注异常操作和未授权访问 |
| 更新依赖 | 每月 | 运行 `pnpm update` 更新 wrangler、hono 等 |
| 监控 API 用量 | 持续 | 避免 GitHub API 超限 |

### 紧急响应流程

1. 发现异常 → 立即开启紧急熔断
2. 审查审计日志，确定影响范围
3. 轮换泄露的密钥
4. 分析根因，修复漏洞
5. 确认安全后解除熔断
6. 撰写事后报告，改进安全措施

---

## 10. 安全 FAQ

**Q: 是否支持 IP 白名单？**
A: 原生不支持，但可通过 Cloudflare WAF 规则在域名级别实现 IP 白名单。

**Q: 上传的文件是否会被扫描？**
A: 系统不包含病毒扫描功能。建议在客户端上传前进行文件检查，或使用 Cloudflare WAF 的托管规则。

**Q: 分享链接是否安全？**
A: 分享链接使用 HMAC-SHA256 签名，包含过期时间。签名验证使用恒定时间比较，防止时序攻击。但分享链接本身不加密，任何人拿到链接均可访问。

**Q: 如何防止 GitHub Token 在日志中泄露？**
A: Token 通过 Cloudflare Secrets 管理，Worker 运行时的环境变量不会出现在用户可见的日志中。同时系统自动清洗上游 GitHub API 响应中的敏感头。

---

## 11. 安全配置清单

### 初次部署

- [ ] GitHub Token 使用 Fine-grained 权限，仅限必要仓库
- [ ] `SIGN_SECRET` 使用强随机字符串（至少 32 字节），建议使用 `openssl rand -hex 32` 生成
- [ ] 已配置防盗链白名单 `ALLOWED_REFERERS`
- [ ] 生产环境已启用签名认证 `ENABLE_SIGNATURE=true`
- [ ] 已配置合理的速率限制 `RATE_LIMIT_PER_MIN`
- [ ] 管理面板已启用认证（Cloudflare Access 或 TOTP）
- [ ] 自定义域名已启用 HTTPS（Cloudflare 代理模式）
- [ ] 删除了代码中的任何测试密钥或凭证
- [ ] `.dev.vars` 和 `.env` 文件已加入 `.gitignore`
- [ ] 已确认 `ENVIRONMENT=production` 以隐藏错误堆栈

### 持续运维

| 任务 | 频率 | 说明 |
|------|------|------|
| 轮换 GitHub Token | 每 90 天 | 在 GitHub Settings 中重新生成 |
| 轮换 SIGN_SECRET | 每 180 天 | 更新后需重新生成所有分享链接 |
| 审查审计日志 | 每周 | 关注异常操作和未授权访问 |
| 审查管理面板登录记录 | 每周 | 确认无不认识的 IP 登录 |
| 更新依赖 | 每月 | `pnpm update` 更新 wrangler、hono 等 |
| 监控 API 用量 | 持续 | 避免 GitHub API 超限 |
| 审查 WAF 规则 | 每季度 | 更新 IP 白名单和速率限制规则 |

### 密钥管理

| 密钥 | 存储位置 | 轮换影响 |
|------|----------|----------|
| `GITHUB_TOKEN` | Cloudflare Secret | 需更新所有仓库的 Token 引用 |
| `SIGN_SECRET` | Cloudflare Secret | 所有分享链接和签名 URL 失效 |
| `ADMIN_TOTP_SECRET` | Cloudflare Secret | 需重新配置 Authenticator App |
| `CF_API_TOKEN` | Cloudflare Secret | 缓存清除功能暂时不可用 |
| `TELEGRAM_BOT_TOKEN` | Cloudflare Secret | 告警通知暂时不可用 |

---

## 12. 安全架构决策记录 (ADR)

### ADR-001: 选择 HMAC-SHA256 而非 JWT

- **决策**: 使用 HMAC-SHA256 签名而非 JWT
- **理由**: 
  - 签名参数直接附加在 URL 上，无需额外的 Header 或 Cookie
  - 签名生成和验证逻辑简单，减少依赖
  - 过期时间由 `exp` 参数显式控制
- **影响**: 签名不包含用户身份信息，仅用于防篡改和过期控制

### ADR-002: D1 + KV 双写而非纯 D1

- **决策**: 保持 D1 主存储 + KV 降级镜像的架构
- **理由**:
  - KV 作为降级路径，在 D1 不可用时保证核心功能可用
  - KV 的全球复制特性提供更快的读取速度
  - 逐步迁移到纯 D1 的风险较低
- **影响**: 需要维护一致性逻辑，增加了系统复杂度

### ADR-003: 紧急熔断通过 KV 动态配置

- **决策**: 紧急熔断开关通过 KV 而非仅环境变量控制
- **理由**:
  - KV 修改即时生效，无需重新部署
  - 管理面板可以一键开关
  - 环境变量作为兜底，KV 不可用时仍可生效
- **影响**: 需要检查两个来源（KV 和环境变量），优先级为 KV > 环境变量