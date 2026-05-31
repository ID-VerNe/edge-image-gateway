### **以下是一份从"能跑"升级到"生产级"的完整补强 Plan，按阶段编排，每一步都给出目标、产出物与验收标准，可直接对照写代码。**

这份补强 plan 在你原 plan 的五个阶段基础上做"加层"和"修订"，不推翻原架构。整体优先级遵循：**安全防护 > Token 收敛 > 缓存与错误处理 > 图片处理 > CI/CD > 监控与合规**。建议按阶段顺序实现，每完成一个阶段都能独立部署、独立验证。

---

### **阶段零：项目骨架与依赖补齐**

**目标**：在原 Hono 项目基础上，把后续要用到的依赖、目录结构、类型定义一次性搭好，避免后面反复改 `package.json`。

**产出物**

- `package.json` 增加依赖：`hono`、`@cloudflare/workers-types`、`vitest`、`@cloudflare/vitest-pool-workers`、`itty-router`(可选)、`zod`(用于参数校验)。
- 目录建议：

```
src/
  index.ts            // 入口，只负责挂中间件和路由
  routes/
    image.ts          // 图片回源主路由
  middleware/
    referer.ts        // 防盗链
    rateLimit.ts      // 限流
    signature.ts      // 签名 URL 校验
    securityHeaders.ts// 响应头清洗
  services/
    github.ts         // 封装 GitHub API 调用
    cache.ts          // 封装 Cache API 读写
    image.ts          // 图片格式协商 / 缩放
  utils/
    mime.ts
    hmac.ts
    logger.ts
  types/
    env.d.ts          // Bindings 类型
tests/
wrangler.toml
.github/workflows/deploy.yml
```

**验收**：`npm run dev` 能起本地 Worker，访问 `/healthz` 返回 `{ ok: true, version: "x.x.x" }`。

---

### **阶段一：Token 与权限收敛（最高优先级安全项）**

**目标**：把"classic PAT + repo 全权限"换成"Fine-grained PAT + 单仓 Contents: Read 只读"，并梳理所有敏感变量。

**实施步骤**

1. 在 GitHub `Settings → Developer settings → Personal access tokens → Fine-grained tokens` 新建 Token：
   - Resource owner：你自己。
   - Repository access：**Only select repositories** → 只勾图床仓库。
   - Repository permissions：**Contents: Read-only**，其他全部 No access。
   - 过期时间：建议 90 天，到期前轮换。
2. 在 Cloudflare 注入 secret：
   ```
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SIGN_SECRET   # 用于后面签名 URL 的 HMAC 密钥
   ```
3. `wrangler.toml` 中只保留非敏感变量：
   ```toml
   [vars]
   GITHUB_USER = "yourname"
   GITHUB_REPO = "your-image-repo"
   GITHUB_BRANCH = "main"
   ALLOWED_REFERERS = "yourdomain.com,blog.yourdomain.com"
   CACHE_TTL_SECONDS = "604800"
   ENABLE_SIGNATURE = "false"
   ```
4. 在 `types/env.d.ts` 中声明 `Bindings` 类型，让 Hono 路由能拿到强类型。

**验收**：本地 `wrangler dev` 通过 `c.env.GITHUB_TOKEN` 能拿到值；GitHub 端把旧的 classic token 删除。

---

### **阶段二：核心回源链路重写（带错误分级与缓存分层）**

**目标**：把"一把 fetch"改成"读边缘缓存 → 回源 GitHub → 写边缘缓存"的三段式，并对错误做精细处理。

**关键逻辑**

1. **路径解析**：用 `app.get('/*', handler)`,从 `c.req.path` 提取相对路径，先做规范化（去除 `..`、空段、强制小写后缀）防穿越。
2. **缓存读取**：
   - `const cache = caches.default;`
   - 用 `new Request(c.req.url, { method: 'GET' })` 作为 cacheKey，先 `cache.match(cacheKey)`。
   - 命中则直接返回，并加上 `X-Cache: HIT` 头便于排查。
3. **回源 GitHub**：
   - URL 模板：`https://api.github.com/repos/${USER}/${REPO}/contents/${path}?ref=${BRANCH}`。
   - Headers：
     - `Authorization: Bearer ${GITHUB_TOKEN}`
     - `Accept: application/vnd.github.raw`（直接拿二进制，不要 base64）
     - `User-Agent: cf-worker-img-proxy`(GitHub 强制要求)
   - 单文件 > 1MB 时 raw 媒体类型仍可用，但 Contents API 限制 100MB；超过则走 Git Data API（blobs）。
4. **错误分级与缓存策略**：
   - 200：缓存 `CACHE_TTL_SECONDS`（默认 7 天）。
   - 304：透传，不缓存 body。
   - 404：短缓存 60 秒，避免拼写错误打爆 API。
   - 401/403（Token 失效）：**不缓存**，记日志并返回 502。
   - 429（GitHub 限流）：**不缓存**，返回 503 + `Retry-After`。
   - 5xx：不缓存。
5. **响应头组装**：
   - `Content-Type` 由 `utils/mime.ts` 按后缀映射，找不到则 `application/octet-stream`。
   - `Cache-Control: public, max-age=${TTL}, s-maxage=${TTL}, immutable`。
   - 删除/不透传：`Server`、`X-GitHub-*`、`Set-Cookie`。
   - 加 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。
6. **写回缓存**：`c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))`。

**验收**：

- 第二次访问同一图片，响应头出现 `X-Cache: HIT`，TTFB < 50ms。
- 故意请求不存在的路径，返回 404 且 60 秒内不再回源 GitHub（用日志验证）。

---

### **阶段三：防盗链中间件**

**目标**：仅允许配置好的域名引用图片，其他来源直接拒绝或返回占位图。

**实施步骤**

1. 在 `middleware/referer.ts` 中读取 `c.req.header('Referer')` 与 `Origin`。
2. 解析出 hostname，与 `ALLOWED_REFERERS`（逗号分隔）做精确匹配 + 父域匹配（如 `*.yourdomain.com`）。
3. 放行规则：
   - 空 Referer：可选放行（方便浏览器直接打开图片调试），生产建议拒绝或仅放行图片直链类型。
   - 命中白名单：放行。
   - 否则：返回 403 或 1×1 透明 PNG（更不易暴露策略）。
4. 把中间件挂在所有图片路由之前：`app.use('/*', refererGuard)`。
5. 单元测试：mock `Referer` 头覆盖三类情况。

**验收**：在非白名单网站用 `<img>` 引用你的图，控制台显示 403 或加载到占位图；在白名单博客中正常显示。

---

### **阶段四：签名 URL（可选但强烈建议）**

**目标**：为隐私性较高的目录（如 `/private/*`）启用 HMAC 签名链接，过期自动失效。

**实施步骤**

1. `utils/hmac.ts` 用 Web Crypto API 实现 HMAC-SHA256：
   - 输入：`path + '|' + exp`
   - 密钥：`SIGN_SECRET`
   - 输出：base64url。
2. `middleware/signature.ts`：
   - 当 `ENABLE_SIGNATURE=true` 或路径前缀为 `/private/` 时强制校验。
   - 从 query 取 `sig`、`exp`，校验 `exp > now` 且签名一致。
   - 不通过返回 403，且**不缓存**。
3. 提供一个本地 CLI 脚本 `scripts/sign.ts`，方便你在博客构建时批量给图片生成签名链接：
   ```
   npx tsx scripts/sign.ts /private/2026/05/secret.png 86400
   ```
4. 注意签名 URL 与 CDN 缓存的冲突：cacheKey 要把 `sig`、`exp` 排除掉，否则缓存命中率会很低。可以把"签名校验"放在"读缓存"之前，校验通过后用"去掉签名参数的 URL"作为 cacheKey。

**验收**：未带签名访问 `/private/foo.png` 返回 403；带过期签名同样 403；正常签名 200 且 5 分钟内重复访问命中边缘缓存。

---

### **阶段五：限流与异常流量防护**

**目标**：单 IP / 单路径异常请求不会打爆 Worker 或 GitHub。

**双层方案**

1. **Cloudflare 平台层（推荐先做，零代码）**：
   - WAF → Custom rules：对该域名设置 `rate limit`，例如同一 IP 每分钟 > 300 次直接 challenge。
   - Bot Fight Mode：开启免费版，过滤明显爬虫。
2. **Worker 应用层（精细控制）**：
   - 用 **Workers KV** 或 **Durable Object** 做计数器。KV 简单但有最终一致性，适合粗粒度（分钟级）；DO 强一致，适合秒级精确限流。
   - 中间件 `rateLimit.ts` 流程：
     - key = `rl:${ip}:${minuteBucket}`。
     - 读取计数 → 超过阈值返回 429（带 `Retry-After: 60`）。
     - 否则 `+1` 并设置 TTL 60s。
   - 阈值建议：默认 120 次/分钟，可通过环境变量 `RATE_LIMIT_PER_MIN` 调整。
3. **路径维度兜底**：对单一路径若 1 分钟内回源 > 10 次（说明缓存被穿透），主动延长该路径缓存 TTL 或写"负缓存"。

**验收**：用 `ab -n 500 -c 50` 压一下，超过阈值后开始返回 429，且 GitHub API 调用次数被压制在阈值之内。

---

### **阶段六：图片处理与格式协商**

**目标**：在不增加存储成本的前提下，按需返回 WebP/AVIF 与缩略图，节省带宽。

**实施步骤**

1. **格式协商**：
   - 读取 `Accept` 头，若包含 `image/avif` 优先 AVIF，其次 WebP，否则原图。
   - 实现路径：
     - 方案 A（推荐起步）：约定上传时同时存 `foo.png` / `foo.webp` / `foo.avif`，Worker 根据 Accept 选择文件名回源。
     - 方案 B：使用 [Cloudflare Image Resizing](https://developers.cloudflare.com/images/transform-images/),通过 `cf: { image: { format: 'auto' } }` 直接边缘转码（需要付费计划）。
2. **尺寸参数**：
   - 支持 `?w=800&q=80&fit=cover`,在 Worker 中调用 `fetch(url, { cf: { image: { width: 800, quality: 80, fit: 'cover' } } })`。
   - 把 `w/q/fit` 一起纳入 cacheKey，避免不同尺寸互相覆盖。
3. **降级策略**：图片处理失败时回退到原图，而不是直接 5xx。
4. **响应头**：加 `Vary: Accept` 让 CDN 正确区分不同格式的缓存。

**验收**：Chrome 访问返回 AVIF/WebP（看 `Content-Type`），Safari 老版本返回原 PNG/JPG；带 `?w=400` 的图片体积明显变小。

---

### **阶段七：可观测性与日志**

**目标**：能看到缓存命中率、回源失败率、限流触发次数，出问题时能 1 分钟内定位。

**实施步骤**

1. **结构化日志**：`utils/logger.ts` 统一输出 JSON：
   ```json
   { "ts": "...", "level": "info", "event": "origin_fetch", "path": "...", "status": 200, "cache": "MISS", "ms": 123 }
   ```
2. **Cloudflare Logpush**：把 Worker 日志推送到 R2 / S3 / Datadog，长期留存。
3. **错误上报**：接入 [Sentry](https://sentry.io) 的 Cloudflare Workers SDK，捕获未处理异常。
4. **业务指标**：用 Workers Analytics Engine 写自定义指标（cache_hit、origin_4xx、origin_5xx、rate_limited），后台用 SQL 查看趋势。
5. **健康检查**：`/healthz` 路由不走任何鉴权，返回构建版本与依赖检查（仅检查环境变量是否齐全，不真打 GitHub，避免被刷）。

**验收**：在 Cloudflare 后台 Logs 实时面板能看到结构化日志；故意把 Token 改错，Sentry 能收到告警。

---

### **阶段八：CI/CD 与多环境**

**目标**：push 到 main 自动部署生产，PR 自动部署预览环境。

**实施步骤**

1. `wrangler.toml` 增加多环境：
   ```toml
   [env.preview]
   name = "img-proxy-preview"
   vars = { ALLOWED_REFERERS = "preview.yourdomain.com" }

   [env.production]
   name = "img-proxy"
   routes = [{ pattern = "img.yourdomain.com/*", zone_name = "yourdomain.com" }]
   ```
2. `.github/workflows/deploy.yml`：
   - 触发：`push` to `main` → 部署 production；`pull_request` → 部署 preview。
   - 步骤：checkout → setup node → `npm ci` → `npm test` → `npx wrangler deploy --env production`。
   - Secrets：在 GitHub repo 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。
3. **Secret 同步**：CI 中不直接 put secret，secret 仍由你本地 `wrangler secret put` 管理；CI 只负责代码部署。
4. **回滚策略**：保留最近 10 个 deployment，出问题时 `wrangler rollback` 一键回退。

**验收**：合并一次 PR 触发生产部署；预览 URL 能独立访问且不影响生产。

---

### **阶段九：测试体系**

**目标**：核心路径有自动化保障，重构不慌。

**实施步骤**

1. **单元测试**（vitest）：
   - `utils/mime.ts`：后缀 → MIME 映射全覆盖。
   - `utils/hmac.ts`：签名生成与校验。
   - `middleware/referer.ts`：白名单/通配/空 Referer 三类用例。
2. **集成测试**（`@cloudflare/vitest-pool-workers`）：
   - mock GitHub API 返回 200/404/429。
   - 验证缓存写入、错误分级、响应头清洗。
3. **端到端冒烟**：部署到 preview 后跑一组 `curl` 脚本，检查关键路径状态码与头。
4. **覆盖率门槛**：核心 `services/`、`middleware/` 不低于 80%。

**验收**：`npm test` 全绿；CI 中测试失败会阻断部署。

---

### **阶段十：日常运维与合规清单**

**目标**：上线之后不"放养"，定期巡检，远离风控。

**清单**

- **Token 轮换**：90 天到期前用新 Fine-grained PAT 替换 `GITHUB_TOKEN`,通过 secret 热更新无需重部署。
- **配额巡检**：每周看一次 Worker Requests、KV Reads、GitHub API 用量，提前规划扩容。
- **仓库容量**：单仓控制在 5GB 以内，接近时启动"换库"流程（新建 `images-v2` → 迁移历史 → 改 `GITHUB_REPO` → 灰度切流）。
- **内容合规**：对人脸、聊天截图等敏感图建立独立目录，并强制启用签名 URL；建立误传删除流程（GitHub 删文件 + Cloudflare 主动 `cache.delete`）。
- **GitHub ToS 风险**：避免把仓库当公共 CDN 卖给他人或挂外链下载站；保持"个人博客自用"的定位。
- **域名与 SSL**：开启 Cloudflare 的 **Always Use HTTPS** 与 **HSTS**；自定义域名 SSL 证书自动续期由 Cloudflare 托管，但每年体检一次。
- **灾备**：本地保留一份图片仓库的 `git clone` 镜像，或开启 GitHub → 自建 NAS 的定时同步，避免单点。

---

### **实施顺序建议（落地节奏）**

如果你时间有限，按下面这个节奏推，每完成一段就能独立享受收益：

第一周：阶段零 + 阶段一 + 阶段二（项目骨架、Token 收敛、核心回源重写），上线后已经比原 plan 安全很多。
第二周：阶段三 + 阶段五（防盗链 + 限流），抗刷能力到位。
第三周：阶段七 + 阶段八（可观测性 + CI/CD），运维基建完成。
第四周：阶段四 + 阶段六（签名 URL + 图片处理），进入"精装修"阶段。
持续：阶段九 + 阶段十（测试 + 运维巡检），长期维护。

按这份 plan 把代码写完，你这个图床就从"个人玩具"升级到了一个**带防盗链、限流、签名、缓存分层、自动 CI/CD 与可观测性的生产级图片服务**,日均百万级请求都能稳稳吃下。

需要的话，我可以下一步直接给你写阶段二（核心回源）+ 阶段三（防盗链）+ 阶段五（限流）这三段的完整 TypeScript 代码，作为骨架你可以直接 `wrangler deploy`。