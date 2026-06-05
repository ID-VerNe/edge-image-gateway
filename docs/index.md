# 文档导航

Edge Image Gateway 完整文档索引。根据你的角色和需求，选择对应的文档。

---

## 快速导航

### 按角色

| 角色 | 推荐阅读顺序 |
|------|-------------|
| **新用户** | [README](../README.md) → [使用指南](../USAGE.md) → [配置说明](configuration.md) |
| **运维部署** | [部署指南](deployment.md) → [配置说明](configuration.md) → [事故手册](runbook.md) |
| **开发者** | [开发指南](development.md) → [架构总览](architecture-overview.md) → [API 参考](api-reference.md) |
| **安全审计** | [安全指南](security.md) → [事故手册](runbook.md) → [架构总览](architecture-overview.md) |

### 按场景

| 场景 | 参考文档 |
|------|----------|
| 从零搭建图床 | [部署指南](deployment.md) |
| 上传第一张图片 | [使用指南](../USAGE.md#上传图片) |
| 配置防盗链 | [配置说明](configuration.md#常见配置场景) |
| 添加第二个存储仓库 | [多仓库管理](multi-repo.md) |
| 集成到博客 | [配置说明](configuration.md#场景一个人博客图床) |
| 生成分享链接 | [使用指南](../USAGE.md#生成分享链接) |
| 排查线上故障 | [事故手册](runbook.md) |
| 了解系统架构 | [架构总览](architecture-overview.md) |
| 贡献代码 | [开发指南](development.md) |

---

## 文档清单

### 入门

| 文档 | 说明 |
|------|------|
| [README](../README.md) | 项目概览、特性一览、快速开始 |
| [使用指南](../USAGE.md) | 日常使用：上传、访问、管理面板、图片处理 |

### 部署与配置

| 文档 | 说明 |
|------|------|
| [部署指南](deployment.md) | 从零部署到 Cloudflare Workers，含资源创建、Secrets 配置、CI/CD |
| [配置说明](configuration.md) | 环境变量、KV 动态配置、多环境管理、常见场景模板 |

### 架构

| 文档 | 说明 |
|------|------|
| [架构总览](architecture-overview.md) | 系统全景：请求生命周期、缓存体系、安全模型、存储引擎 |
| [架构说明](architecture.md) | 模块细节：组件设计、KV 键模型、错误处理、Cron 任务 |

### 功能

| 文档 | 说明 |
|------|------|
| [管理面板](admin-panel.md) | 管理面板功能、认证方式、前端技术实现 |
| [多仓库管理](multi-repo.md) | 多仓库路由、容量管理、仓库迁移、多 Token 管理 |
| [API 参考](api-reference.md) | 所有 API 端点详细说明、请求/响应示例 |

### 安全与运维

| 文档 | 说明 |
|------|------|
| [安全指南](security.md) | 安全架构、认证鉴权、最佳实践、Token 泄露响应流程 |
| [事故手册](runbook.md) | 10 类常见事故的应急处置步骤 |

### 开发

| 文档 | 说明 |
|------|------|
| [开发指南](development.md) | 本地开发、项目结构、测试、调试、发布流程 |

---

## 核心概念速查

| 概念 | 说明 | 详见 |
|------|------|------|
| **中间件链** | 速率限制 → 防盗链 → 签名认证 → 管理认证 | [架构总览](architecture-overview.md#3-请求生命周期) |
| **四级缓存** | L1 Workers Cache → L2 R2 → L3 Browser → L4 Memory | [架构总览](architecture-overview.md#7-性能优化与缓存架构) |
| **多仓库路由** | 按路径前缀/索引匹配，自动选择读写目标仓库 | [多仓库管理](multi-repo.md) |
| **紧急熔断** | 一键关闭所有写操作，保留读服务 | [安全指南](security.md#2-紧急熔断) |
| **HMAC 签名** | 写操作和分享链接的签名认证机制 | [安全指南](security.md#4-签名认证) |
| **D1/KV 双写** | D1 主存储 + KV 降级镜像，兼顾性能和可用性 | [架构总览](architecture-overview.md#5-数据持久化方案) |
| **仓库迁移** | 跨仓库文件迁移，支持断点续传 | [多仓库管理](multi-repo.md#仓库迁移) |
| **审计日志** | 所有敏感操作的不可篡改记录 | [安全指南](security.md#8-审计日志) |

---

## 路线图

以下是项目规划中的功能方向：

### 短期规划

- [ ] TOTP 双因素认证全面支持（API Token 绑定 TOTP）
- [ ] WebP/AVIF 自动格式协商（基于 Accept 请求头）
- [ ] 图片水印叠加（文字水印 + 图片水印）
- [ ] 批量上传进度条与断点续传
- [ ] 文件移动/重命名功能完善
- [ ] 管理面板深色模式

### 中期规划

- [ ] 多语言管理面板（i18n 支持）
- [ ] Prometheus 指标导出端点
- [ ] 自定义域名自动 HTTPS 配置
- [ ] 图片智能压缩（自动选择最优质量参数）
- [ ] 存储桶生命周期策略（自动清理过期变体缓存）
- [ ] 管理面板操作确认增强（批量操作撤销）

### 长期规划

- [ ] 支持 S3 兼容存储作为后端（MinIO、R2 直接存储）
- [ ] 图片 AI 自动标签与分类
- [ ] Webhook 事件通知（上传/删除/迁移事件）
- [ ] 多用户协作与权限管理
- [ ] 图片版本管理与回滚
- [ ] Terraform / Pulumi 基础设施即代码支持

---

## 外部资源

| 资源 | 链接 |
|------|------|
| Cloudflare Workers 文档 | [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/) |
| Hono 框架文档 | [hono.dev](https://hono.dev/) |
| GitHub REST API | [docs.github.com/en/rest](https://docs.github.com/en/rest) |
| Cloudflare Image Resizing | [developers.cloudflare.com/images](https://developers.cloudflare.com/images/image-resizing/) |