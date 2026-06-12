# TypeScript / Node.js 接入指南

本文档介绍如何在 TypeScript 或 Node.js 应用中接入 Edge Image Gateway 图床服务。

更多通用信息（认证方式、API 端点、工具集成等）请参考 [接入指南](index.md)。

---

## 目录

- [环境要求](#环境要求)
- [客户端封装](#客户端封装)
- [上传图片](#上传图片)
- [删除文件](#删除文件)
- [生成分享链接](#生成分享链接)
- [生成签名 URL](#生成签名-url)
- [批量上传](#批量上传)
- [浏览器环境上传](#浏览器环境上传)
- [完整示例](#完整示例)

---

## 环境要求

- Node.js 18+（原生支持 `fetch` 和 `FormData`）
- 无需额外依赖

---

## 客户端封装

```typescript
// image-host.ts

export interface UploadResult {
  url: string;
  fullUrl: string;
  path: string;
  repo: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  deduplicated: boolean;
}

export interface ShareResult {
  success: boolean;
  sig: string;
  exp: number;
  url: string;
}

export interface FileListResult {
  files: Array<{
    name: string;
    path: string;
    type: string;
    size: number;
    sha: string;
    repo: string;
    updatedAt: string;
  }>;
  total: number;
  page: number;
  hasMore: boolean;
}

export class ImageHost {
  private baseUrl: string;
  private token: string;

  /**
   * @param baseUrl 图床域名，如 https://img.example.com
   * @param token   API 令牌，在管理面板中生成
   */
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      ...extra,
    };
  }

  // ========== 上传 ==========

  /**
   * 从本地文件上传图片（Node.js 环境）
   *
   * @param filePath  本地图片路径
   * @param targetDir 目标目录，如 "blog/2025"
   */
  async upload(filePath: string, targetDir?: string): Promise<UploadResult> {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const form = new FormData();
    form.append("file", new Blob([buffer]), fileName);
    if (targetDir) {
      form.append("targetDir", targetDir);
    }

    const resp = await fetch(`${this.baseUrl}/admin/api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });

    if (!resp.ok) {
      throw new Error(`上传失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  /**
   * 从 Buffer 上传（Node.js 环境）
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    targetDir?: string
  ): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", new Blob([buffer]), fileName);
    if (targetDir) {
      form.append("targetDir", targetDir);
    }

    const resp = await fetch(`${this.baseUrl}/admin/api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });

    if (!resp.ok) {
      throw new Error(`上传失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  /**
   * 从 File 对象上传（浏览器环境）
   */
  async uploadFile(file: File, targetDir?: string): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file);
    if (targetDir) {
      form.append("targetDir", targetDir);
    }

    const resp = await fetch(`${this.baseUrl}/admin/api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });

    if (!resp.ok) {
      throw new Error(`上传失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ========== 删除 ==========

  async delete(path: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/admin/api/files`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path }),
    });

    if (!resp.ok) {
      throw new Error(`删除失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ========== 分享 ==========

  /**
   * 生成分享链接
   *
   * @param path    文件路径
   * @param expires 有效期（秒），默认 86400（24 小时）
   */
  async share(path: string, expires: number = 86400): Promise<ShareResult> {
    const resp = await fetch(`${this.baseUrl}/admin/api/files/share`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path, expires }),
    });

    if (!resp.ok) {
      throw new Error(`生成分享链接失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ========== 文件列表 ==========

  async listFiles(
    dirPath: string = "/",
    search: string = "",
    page: number = 1,
    limit: number = 50
  ): Promise<FileListResult> {
    const params = new URLSearchParams({
      path: dirPath,
      page: String(page),
      limit: String(limit),
    });
    if (search) {
      params.set("search", search);
    }

    const resp = await fetch(
      `${this.baseUrl}/admin/api/files?${params}`,
      { headers: this.headers() }
    );

    if (!resp.ok) {
      throw new Error(`获取文件列表失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ========== 统计 ==========

  async stats(): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/admin/api/stats`, {
      headers: this.headers(),
    });

    if (!resp.ok) {
      throw new Error(`获取统计失败: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ========== 签名 URL（静态方法） ==========

  /**
   * 生成带 HMAC 签名的访问 URL（Node.js 环境）
   *
   * 签名算法：HMAC-SHA256，Base64URL 编码（无填充）
   * 签名消息：{path}|{exp}
   */
  static generateSignedUrl(
    baseUrl: string,
    path: string,
    secret: string,
    expiresIn: number = 3600
  ): string {
    const { createHmac } = require("node:crypto");

    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const message = `${path}|${exp}`;

    const sig = createHmac("sha256", secret)
      .update(message)
      .digest("base64url");

    return `${baseUrl.replace(/\/$/, "")}${path}?sig=${sig}&exp=${exp}`;
  }

  /**
   * 生成带 HMAC 签名的访问 URL（浏览器环境，使用 Web Crypto API）
   */
  static async generateSignedUrlBrowser(
    baseUrl: string,
    path: string,
    secret: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const message = `${path}|${exp}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

    const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    const sig = base64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return `${baseUrl.replace(/\/$/, "")}${path}?sig=${sig}&exp=${exp}`;
  }
}
```

---

## 上传图片

```typescript
import { ImageHost } from "./image-host";

const client = new ImageHost("https://img.example.com", "<你的API令牌>");

// 从本地文件上传
const result = await client.upload("photo.jpg", "blog/2025");
console.log("上传成功:", result.fullUrl);

if (result.deduplicated) {
  console.log("检测到重复图片，已返回已有链接");
}

// 从 Buffer 上传
const buffer = await fetch("https://example.com/remote-image.jpg")
  .then(r => r.arrayBuffer())
  .then(b => Buffer.from(b));
const result2 = await client.uploadBuffer(buffer, "downloaded.jpg");
```

---

## 删除文件

```typescript
await client.delete("/images/photo.jpg");
```

---

## 生成分享链接

```typescript
// 24 小时有效
const share = await client.share("/images/photo.jpg", 86400);
console.log("分享链接:", share.url);

// 7 天有效
const share7d = await client.share("/images/photo.jpg", 604800);
```

---

## 生成签名 URL

```typescript
import { ImageHost } from "./image-host";

// Node.js 环境
const signedUrl = ImageHost.generateSignedUrl(
  "https://img.example.com",
  "/private/secret.jpg",
  "<你的SIGN_SECRET>",
  86400
);
console.log("签名 URL:", signedUrl);
// => https://img.example.com/private/secret.jpg?sig=xxx&exp=1717200000

// 浏览器环境
const signedUrl2 = await ImageHost.generateSignedUrlBrowser(
  "https://img.example.com",
  "/private/secret.jpg",
  "<你的SIGN_SECRET>",
  86400
);
```

---

## 批量上传

```typescript
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { ImageHost } from "./image-host";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"]);

async function batchUpload(
  client: ImageHost,
  directory: string,
  targetDir: string = ""
): Promise<void> {
  const files = await readdir(directory);

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    const filePath = join(directory, file);
    try {
      const result = await client.upload(filePath, targetDir);
      if (result.deduplicated) {
        console.log(`跳过重复: ${file} -> ${result.fullUrl}`);
      } else {
        console.log(`上传成功: ${file} -> ${result.fullUrl}`);
      }
    } catch (err) {
      console.error(`上传失败: ${file}`, err);
    }
  }
}

// 使用
const client = new ImageHost("https://img.example.com", "<你的API令牌>");
await batchUpload(client, "./images", "batch-upload");
```

---

## 浏览器环境上传

```typescript
import { ImageHost } from "./image-host";

const client = new ImageHost("https://img.example.com", "<你的API令牌>");

// 拖拽上传
const dropZone = document.getElementById("drop-zone")!;
dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  const files = (e as DragEvent).dataTransfer?.files;
  if (!files) return;

  for (const file of files) {
    try {
      const result = await client.uploadFile(file, "user-uploads");
      console.log("上传成功:", result.fullUrl);
    } catch (err) {
      console.error("上传失败:", err);
    }
  }
});

// 文件选择上传
const input = document.getElementById("file-input") as HTMLInputElement;
input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const result = await client.uploadFile(file);
  console.log("上传成功:", result.fullUrl);
});
```

> **安全警告**：不要在前端代码中直接暴露 API 令牌。建议通过你自己的后端代理转发上传请求。

---

## 完整示例

```typescript
// image-host.ts
import { createHmac } from "node:crypto";

export interface UploadResult {
  url: string;
  fullUrl: string;
  path: string;
  repo: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  deduplicated: boolean;
}

export class ImageHost {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  async upload(filePath: string, targetDir?: string): Promise<UploadResult> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const form = new FormData();
    form.append("file", new Blob([buffer]), fileName);
    if (targetDir) form.append("targetDir", targetDir);

    const resp = await fetch(`${this.baseUrl}/admin/api/upload`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    if (!resp.ok) throw new Error(`上传失败: ${resp.status}`);
    return resp.json();
  }

  async delete(path: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/admin/api/files`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path }),
    });
    return resp.json();
  }

  async share(path: string, expires: number = 86400): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/admin/api/files/share`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path, expires }),
    });
    return resp.json();
  }

  static generateSignedUrl(
    baseUrl: string,
    path: string,
    secret: string,
    expiresIn: number = 3600
  ): string {
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const sig = createHmac("sha256", secret)
      .update(`${path}|${exp}`)
      .digest("base64url");
    return `${baseUrl.replace(/\/$/, "")}${path}?sig=${sig}&exp=${exp}`;
  }
}


// ========== 使用示例 ==========

async function main() {
  const client = new ImageHost("https://img.example.com", "<你的API令牌>");

  // 上传图片
  const result = await client.upload("photo.jpg", "blog/2025");
  console.log("上传成功:", result.fullUrl);

  // 生成签名 URL
  const signedUrl = ImageHost.generateSignedUrl(
    "https://img.example.com",
    result.path,
    "<你的SIGN_SECRET>",
    86400
  );
  console.log("签名 URL:", signedUrl);
}

main();
```