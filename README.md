# Picbed CF GitHub

基于 Cloudflare Workers + Hono + GitHub Private Repo 的生产级私有图床。

## 特性

- **GitHub 私库存储**：利用 GitHub 私有仓库作为存储，安全且免费。
- **Cloudflare 边缘缓存**：极速访问，减少对 GitHub API 的调用。
- **防盗链保护**：支持 Referer 白名单。
- **HMAC 签名安全链接**：可为私密目录开启带过期时间的签名链接。
- **自动格式转换与缩放**：利用 Cloudflare Image Resizing 自动提供 WebP/AVIF 及尺寸缩放。
- **限流防护**：内置 IP 级限流。
- **CI/CD**：集成 GitHub Actions 自动部署。

## 快速开始

1. **GitHub 准备**：
   - 创建私有仓库。
   - 生成 Fine-grained PAT (Contents: Read-only)。

2. **部署**：
   ```bash
   pnpm install
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SIGN_SECRET
   pnpm deploy
   ```

3. **配置 `wrangler.toml`**：
   修改 `GITHUB_USER`, `GITHUB_REPO` 等变量。

## 使用签名链接

使用内置脚本生成签名：
```bash
npx tsx scripts/sign.ts /private/test.png 3600 <your_sign_secret>
```

## 测试

```bash
pnpm test
```
