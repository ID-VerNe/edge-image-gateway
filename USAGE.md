# Picbed Usage Guide

本文档说明如何在应用中集成和使用图床图片代理服务。

## 1. 基础 URL 结构

服务从 GitHub 仓库代理图片。基础 URL 格式为：

```
https://{your-domain}/{path_to_image}
```

**示例：**

```
https://img.example.com/2026/06/my-image.jpg
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

---

## 4. React 集成示例

```tsx
import React from 'react';

interface PicbedImageProps {
  path: string;
  width?: number;
  height?: number;
  quality?: number;
  alt?: string;
  className?: string;
}

const PicbedImage: React.FC<PicbedImageProps> = ({
  path,
  width,
  height,
  quality = 80,
  alt = "",
  className
}) => {
  const baseUrl = "https://img.example.com";
  const params = new URLSearchParams();

  if (width) params.append('w', width.toString());
  if (height) params.append('h', height.toString());
  params.append('q', quality.toString());

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

export default PicbedImage;
```

### 使用示例

```tsx
<PicbedImage
  path="blog/hero-banner.jpg"
  width={1200}
  alt="Hero Banner"
/>
```

---

## 5. 注意事项

确保前端应用的域名已添加到环境变量 `ALLOWED_REFERERS` 中，否则在启用签名保护时会返回 403 错误。