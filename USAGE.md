# Edge Image Gateway Usage Guide

本文档说明如何在应用中集成和使用本图片代理服务。

---

## 目录

- [基础 URL 结构](#1-基础-url-结构)
- [图片缩放与优化](#2-图片缩放与优化)
- [安全与签名](#3-安全与签名)
- [前端集成示例](#4-前端集成示例)
- [Markdown 集成](#5-markdown-集成)
- [命令行工具](#6-命令行工具)
- [注意事项](#7-注意事项)

---

## 1. 基础 URL 结构

服务从 GitHub 仓库代理图片。基础 URL 格式为：

```
https://{your-domain}/{path_to_image}
```

**示例：**

```
https://img.example.com/2026/06/my-image.jpg
```

路径对应的是仓库中的文件路径。例如仓库中 `images/blog/photo.jpg` 文件的访问 URL 就是：

```
https://img.example.com/images/blog/photo.jpg
```

---

## 2. 图片缩放与优化

可通过 URL 查询参数动态调整图片尺寸和质量。

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| `w` | 目标宽度（像素） | `?w=800` |
| `h` | 目标高度（像素） | `?h=600` |
| `q` | 输出质量（1-100） | `?q=75` |
| `fit` | 缩放模式（`cover`、`contain`、`scale-down`） | `?fit=contain` |

**优化示例：**

```
https://img.example.com/avatar.png?w=200&h=200&q=80&fit=cover
```

> **注意**：质量参数 `q` 在值为 100 时禁用有损压缩，建议日常使用设置为 80-85 以平衡质量与体积。

---

## 3. 安全与签名

如果环境变量 `ENABLE_SIGNATURE` 设置为 `true`，来自非白名单域名的请求需要携带 HMAC 签名才能访问图片。

### 白名单访问

配置在 `ALLOWED_REFERERS` 中的域名（如 `example.com`）发起的请求自动允许，无需签名。

### 签名访问

对于其他场景或受保护路径（`/private/`、`/draft/`、`/raw/`），必须附加签名参数：

```
URL: /{path}?sig={hmac}&exp={unix_timestamp}
```

签名算法为 `HMAC-SHA256(path + "|" + expiry, SIGN_SECRET)`。

**临时签名分享示例**：

```
https://img.example.com/private/photo.jpg?sig=abc123def456&exp=1893456000
```

使用项目中的签名生成脚本可以快速生成签名链接：

```bash
# 生成有效期 1 小时的签名链接
pnpm tsx scripts/sign.ts "/private/photo.jpg" 3600
```

---

## 4. 前端集成示例

### React

```tsx
import React from 'react';

interface GatewayImageProps {
  path: string;
  width?: number;
  height?: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'scale-down';
  alt?: string;
  className?: string;
}

const GatewayImage: React.FC<GatewayImageProps> = ({
  path,
  width,
  height,
  quality = 80,
  fit,
  alt = "",
  className
}) => {
  const baseUrl = "https://img.example.com";
  const params = new URLSearchParams();

  if (width) params.append('w', width.toString());
  if (height) params.append('h', height.toString());
  params.append('q', quality.toString());
  if (fit) params.append('fit', fit);

  const src = `${baseUrl}/${path.replace(/^\//, '')}?${params.toString()}`;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
};

export default GatewayImage;
```

**使用示例：**

```tsx
<GatewayImage
  path="blog/hero-banner.jpg"
  width={1200}
  height={630}
  fit="cover"
  alt="博客封面图"
/>
```

### Vue 3

```vue
<template>
  <img
    :src="imageSrc"
    :alt="alt"
    :class="className"
    loading="lazy"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  path: string
  width?: number
  height?: number
  quality?: number
  fit?: 'cover' | 'contain' | 'scale-down'
  alt?: string
  className?: string
}>(), {
  quality: 80,
  alt: ''
})

const baseUrl = "https://img.example.com"

const imageSrc = computed(() => {
  const params = new URLSearchParams()
  if (props.width) params.append('w', props.width.toString())
  if (props.height) params.append('h', props.height.toString())
  params.append('q', props.quality.toString())
  if (props.fit) params.append('fit', props.fit)
  const query = params.toString()
  return `${baseUrl}/${props.path.replace(/^\//, '')}${query ? '?' + query : ''}`
})
</script>
```

### 原生 JavaScript

```html
<img id="gateway-image" loading="lazy" alt="示例图片" />

<script>
function buildGatewayUrl(path, options = {}) {
  const baseUrl = "https://img.example.com";
  const params = new URLSearchParams();

  if (options.width) params.append('w', options.width);
  if (options.height) params.append('h', options.height);
  if (options.quality) params.append('q', options.quality);
  if (options.fit) params.append('fit', options.fit);

  const query = params.toString();
  return `${baseUrl}/${path.replace(/^\//, '')}${query ? '?' + query : ''}`;
}

const img = document.getElementById('gateway-image');
img.src = buildGatewayUrl('blog/photo.jpg', {
  width: 800,
  quality: 85
});
</script>
```

---

## 5. Markdown 集成

在 Markdown 中直接引用图片，支持缩放参数：

```markdown
![示例图片](https://img.example.com/2026/photo.jpg?w=800&q=80)
```

结合图片缩放使用，适合在不同平台控制图片显示大小：

```markdown
## 文章内图片

<!-- 全宽图片 -->
![风景图](https://img.example.com/landscape.jpg?w=1200&q=85)

<!-- 缩略图 -->
![头像](https://img.example.com/avatar.png?w=200&h=200&fit=cover)
```

---

## 6. 命令行工具

### 使用 curl 测试

```bash
# 获取原始图片
curl -O https://img.example.com/photo.jpg

# 获取缩略图
curl -o thumbnail.jpg "https://img.example.com/photo.jpg?w=200&q=70"

# 获取响应头信息
curl -I "https://img.example.com/photo.jpg"
```

### 批量下载脚本

```bash
# 下载一组图片的缩略图（PowerShell）
$baseUrl = "https://img.example.com"
$images = @("photo1.jpg", "photo2.jpg", "photo3.jpg")

foreach ($img in $images) {
  $url = "$baseUrl/$img`?w=400&q=75"
  Invoke-WebRequest -Uri $url -OutFile "thumb_$img"
  Write-Host "已下载: $img"
}
```

---

## 7. 注意事项

1. **防盗链配置**：确保前端应用的域名已添加到环境变量 `ALLOWED_REFERERS` 中，否则在启用签名保护时会返回 403 错误。
2. **缓存策略**：图片默认缓存 7 天（由 `CACHE_TTL_SECONDS` 控制），上传新图片后如未立即更新可等待缓存过期，或通过管理后台手动清除缓存。
3. **路径大小写**：GitHub 仓库的文件路径区分大小写，请注意 URL 中的路径大小写需与仓库中完全一致。
4. **签名有效期**：签名链接的 `exp` 参数使用 Unix 时间戳（秒），过期的签名链接将返回 403 错误。
5. **图片格式**：推荐使用 JPEG/WebP 格式存储照片，PNG 格式存储截图或需要透明背景的图片。
