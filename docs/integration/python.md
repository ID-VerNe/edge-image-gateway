# Python 接入指南

本文档介绍如何在 Python 应用中接入 Edge Image Gateway 图床服务。

更多通用信息（认证方式、API 端点、工具集成等）请参考 [接入指南](index.md)。

---

## 目录

- [安装依赖](#安装依赖)
- [客户端封装](#客户端封装)
- [上传图片](#上传图片)
- [删除文件](#删除文件)
- [生成分享链接](#生成分享链接)
- [生成签名 URL](#生成签名-url)
- [批量上传](#批量上传)
- [完整示例](#完整示例)

---

## 安装依赖

```bash
pip install requests
```

---

## 客户端封装

```python
import requests
from pathlib import Path


class ImageHost:
    """Edge Image Gateway 客户端"""

    def __init__(self, base_url: str, token: str):
        """
        初始化客户端

        Args:
            base_url: 图床域名，如 https://img.example.com
            token:    API 令牌，在管理面板中生成
        """
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _headers(self, extra: dict = None) -> dict:
        """构建请求头"""
        headers = {"Authorization": f"Bearer {self.token}"}
        if extra:
            headers.update(extra)
        return headers

    # ---------- 上传 ----------

    def upload(self, file_path: str, target_dir: str = "") -> dict:
        """
        上传图片

        Args:
            file_path:  本地图片路径
            target_dir: 目标目录，如 "blog/2025"

        Returns:
            {
                "url": "/blog/2025/photo-a1b2c3.jpg",
                "fullUrl": "https://img.example.com/blog/2025/photo-a1b2c3.jpg",
                "path": "blog/2025/photo-a1b2c3.jpg",
                "repo": "repo-main",
                "size": 102400,
                "sha256": "abc123...",
                "uploadedAt": "2025-01-01T00:00:00.000Z",
                "deduplicated": false
            }
        """
        url = f"{self.base_url}/admin/api/upload"

        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f)}
            data = {}
            if target_dir:
                data["targetDir"] = (None, target_dir)
            resp = requests.post(url, headers=self._headers(), files=files, data=data)

        resp.raise_for_status()
        return resp.json()

    def upload_bytes(self, data: bytes, filename: str, target_dir: str = "") -> dict:
        """
        上传字节数据（适用于内存中的图片）

        Args:
            data:       图片字节数据
            filename:   文件名
            target_dir: 目标目录

        Returns:
            同 upload()
        """
        url = f"{self.base_url}/admin/api/upload"

        files = {"file": (filename, data)}
        form_data = {}
        if target_dir:
            form_data["targetDir"] = (None, target_dir)
        resp = requests.post(url, headers=self._headers(), files=files, data=form_data)

        resp.raise_for_status()
        return resp.json()

    # ---------- 删除 ----------

    def delete(self, path: str) -> dict:
        """
        删除文件

        Args:
            path: 文件路径，如 "/images/photo.jpg"
        """
        url = f"{self.base_url}/admin/api/files"
        headers = self._headers({"Content-Type": "application/json"})
        resp = requests.delete(url, headers=headers, json={"path": path})
        resp.raise_for_status()
        return resp.json()

    # ---------- 分享 ----------

    def share(self, path: str, expires: int = 86400) -> dict:
        """
        生成分享链接

        Args:
            path:    文件路径
            expires: 有效期（秒），默认 86400（24 小时）

        Returns:
            {
                "success": true,
                "sig": "abc123...",
                "exp": 1700000000,
                "url": "https://img.example.com/images/photo.jpg?sig=abc123...&exp=1700000000"
            }
        """
        url = f"{self.base_url}/admin/api/files/share"
        headers = self._headers({"Content-Type": "application/json"})
        resp = requests.post(url, headers=headers, json={"path": path, "expires": expires})
        resp.raise_for_status()
        return resp.json()

    # ---------- 文件列表 ----------

    def list_files(self, path: str = "/", search: str = "", page: int = 1, limit: int = 50) -> dict:
        """
        列出文件

        Args:
            path:   目录路径
            search: 搜索关键词
            page:   页码
            limit:  每页数量
        """
        url = f"{self.base_url}/admin/api/files"
        params = {"path": path, "page": page, "limit": limit}
        if search:
            params["search"] = search
        resp = requests.get(url, headers=self._headers(), params=params)
        resp.raise_for_status()
        return resp.json()

    # ---------- 统计 ----------

    def stats(self) -> dict:
        """获取存储统计"""
        url = f"{self.base_url}/admin/api/stats"
        resp = requests.get(url, headers=self._headers())
        resp.raise_for_status()
        return resp.json()
```

---

## 上传图片

```python
client = ImageHost("https://img.example.com", "<你的API令牌>")

# 上传到根目录
result = client.upload("photo.jpg")
print(f"上传成功: {result['fullUrl']}")

# 上传到指定目录
result = client.upload("photo.jpg", target_dir="blog/2025")
print(f"上传成功: {result['fullUrl']}")

# 检测去重
if result.get("deduplicated"):
    print("检测到重复图片，已返回已有链接")

# 从内存中上传（Pillow 图片等）
from PIL import Image
import io

img = Image.new("RGB", (100, 100), color="red")
buf = io.BytesIO()
img.save(buf, format="PNG")
result = client.upload_bytes(buf.getvalue(), "generated.png")
```

---

## 删除文件

```python
client.delete("/images/photo.jpg")
```

---

## 生成分享链接

```python
# 24 小时有效
result = client.share("/images/photo.jpg", expires=86400)
print(f"分享链接: {result['url']}")

# 7 天有效
result = client.share("/images/photo.jpg", expires=604800)
```

---

## 生成签名 URL

当需要访问受保护的图片（`/private/`、`/draft/`、`/raw/` 路径，或全局签名开启时），需要生成带签名的 URL。

```python
import hmac
import hashlib
import base64
import time


def generate_signed_url(base_url: str, path: str, secret: str, expires_in: int = 3600) -> str:
    """
    生成带 HMAC 签名的访问 URL

    签名算法：HMAC-SHA256，Base64URL 编码（无填充）
    签名消息：{path}|{exp}

    Args:
        base_url:   图床域名
        path:       文件路径，以 / 开头
        secret:     SIGN_SECRET 密钥
        expires_in: 有效期（秒）

    Returns:
        带签名的完整 URL
    """
    exp = int(time.time()) + expires_in
    message = f"{path}|{exp}"

    sig_bytes = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).digest()

    sig = base64.urlsafe_b64encode(sig_bytes).rstrip(b"=").decode("ascii")

    return f"{base_url.rstrip('/')}{path}?sig={sig}&exp={exp}"


# 使用示例
url = generate_signed_url(
    "https://img.example.com",
    "/private/secret.jpg",
    "<你的SIGN_SECRET>",
    expires_in=86400
)
print(url)
# => https://img.example.com/private/secret.jpg?sig=xxx&exp=1717200000
```

---

## 批量上传

```python
import os
from pathlib import Path


def batch_upload(client: ImageHost, directory: str, target_dir: str = ""):
    """批量上传目录中的所有图片"""
    extensions = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"}

    for file_path in Path(directory).iterdir():
        if file_path.suffix.lower() not in extensions:
            continue

        try:
            result = client.upload(str(file_path), target_dir=target_dir)
            if result.get("deduplicated"):
                print(f"跳过重复: {file_path.name} -> {result['fullUrl']}")
            else:
                print(f"上传成功: {file_path.name} -> {result['fullUrl']}")
        except Exception as e:
            print(f"上传失败: {file_path.name} - {e}")


# 使用
client = ImageHost("https://img.example.com", "<你的API令牌>")
batch_upload(client, "./images", target_dir="batch-upload")
```

---

## 完整示例

```python
import requests
from pathlib import Path
import hmac
import hashlib
import base64
import time


class ImageHost:
    """Edge Image Gateway Python 客户端"""

    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _headers(self, extra: dict = None) -> dict:
        headers = {"Authorization": f"Bearer {self.token}"}
        if extra:
            headers.update(extra)
        return headers

    def upload(self, file_path: str, target_dir: str = "") -> dict:
        url = f"{self.base_url}/admin/api/upload"
        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f)}
            data = {}
            if target_dir:
                data["targetDir"] = (None, target_dir)
            resp = requests.post(url, headers=self._headers(), files=files, data=data)
        resp.raise_for_status()
        return resp.json()

    def delete(self, path: str) -> dict:
        url = f"{self.base_url}/admin/api/files"
        headers = self._headers({"Content-Type": "application/json"})
        resp = requests.delete(url, headers=headers, json={"path": path})
        resp.raise_for_status()
        return resp.json()

    def share(self, path: str, expires: int = 86400) -> dict:
        url = f"{self.base_url}/admin/api/files/share"
        headers = self._headers({"Content-Type": "application/json"})
        resp = requests.post(url, headers=headers, json={"path": path, "expires": expires})
        resp.raise_for_status()
        return resp.json()

    def list_files(self, path: str = "/", search: str = "", page: int = 1, limit: int = 50) -> dict:
        url = f"{self.base_url}/admin/api/files"
        params = {"path": path, "page": page, "limit": limit}
        if search:
            params["search"] = search
        resp = requests.get(url, headers=self._headers(), params=params)
        resp.raise_for_status()
        return resp.json()

    def stats(self) -> dict:
        url = f"{self.base_url}/admin/api/stats"
        resp = requests.get(url, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def generate_signed_url(base_url: str, path: str, secret: str, expires_in: int = 3600) -> str:
        exp = int(time.time()) + expires_in
        message = f"{path}|{exp}"
        sig_bytes = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        ).digest()
        sig = base64.urlsafe_b64encode(sig_bytes).rstrip(b"=").decode("ascii")
        return f"{base_url.rstrip('/')}{path}?sig={sig}&exp={exp}"


# ========== 使用示例 ==========

if __name__ == "__main__":
    client = ImageHost("https://img.example.com", "<你的API令牌>")

    # 上传图片
    result = client.upload("photo.jpg", target_dir="blog/2025")
    print(f"上传成功: {result['fullUrl']}")

    # 生成签名 URL
    signed_url = ImageHost.generate_signed_url(
        "https://img.example.com",
        result["path"],
        "<你的SIGN_SECRET>",
        expires_in=86400
    )
    print(f"签名 URL: {signed_url}")
```