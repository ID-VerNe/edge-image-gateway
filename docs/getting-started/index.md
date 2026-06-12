# 入门

Edge Image Gateway 是一个基于 Cloudflare Workers 的轻量级图床服务，将 GitHub 仓库作为图片存储后端。

## 快速开始

1. 阅读 [README](../README.md) 了解项目特性
2. 参考 [部署指南](../deployment/deployment.md) 完成部署
3. 查看 [使用指南](../../USAGE.md) 学习上传和管理图片

## 核心概念

| 概念 | 说明 |
|------|------|
| GitHub 存储 | 图片存储在 GitHub 仓库中，通过 API 读写 |
| Cloudflare 边缘 | Worker 运行在 Cloudflare 全球边缘节点，提供缓存和图片处理 |
| 管理面板 | `/admin` 路径提供 Web 管理界面 |
| API 令牌 | 在管理面板生成，用于 API 调用认证 |

## 支持的图片格式

png、jpeg、webp、avif、gif、svg+xml，单文件最大 25MB。