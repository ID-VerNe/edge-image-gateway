# PHP 接入指南

本文档介绍如何在 PHP 应用中接入 Edge Image Gateway 图床服务。

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
- [完整示例](#完整示例)

---

## 环境要求

- PHP 7.4+（推荐 8.0+）
- 启用 `curl` 扩展
- 无需第三方依赖（使用 PHP 内置函数）

---

## 客户端封装

```php
<?php

class ImageHost
{
    private string $baseUrl;
    private string $token;

    /**
     * @param string $baseUrl 图床域名，如 https://img.example.com
     * @param string $token   API 令牌，在管理面板中生成
     */
    public function __construct(string $baseUrl, string $token)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->token = $token;
    }

    /**
     * 通用 HTTP 请求
     */
    private function request(string $method, string $path, array $options = []): array
    {
        $url = $this->baseUrl . $path;
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        $headers = ["Authorization: Bearer {$this->token}"];

        if ($method === 'POST' || $method === 'DELETE') {
            if (isset($options['json'])) {
                $body = json_encode($options['json']);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
                $headers[] = 'Content-Type: application/json';
            } elseif (isset($options['multipart'])) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $options['multipart']);
            }
        }

        if (isset($options['query'])) {
            curl_setopt($ch, CURLOPT_URL, $url . '?' . http_build_query($options['query']));
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new \RuntimeException("请求失败: {$error}");
        }

        $data = json_decode($response, true);

        if ($httpCode >= 400) {
            $msg = $data['error'] ?? $response;
            throw new \RuntimeException("请求失败 [{$httpCode}]: {$msg}");
        }

        return $data ?? [];
    }

    // ========== 上传 ==========

    /**
     * 上传图片
     *
     * @param string $filePath  本地图片路径
     * @param string $targetDir 目标目录，如 "blog/2025"
     *
     * @return array 包含 fullUrl、path、size、sha256 等字段
     */
    public function upload(string $filePath, string $targetDir = ''): array
    {
        if (!file_exists($filePath)) {
            throw new \InvalidArgumentException("文件不存在: {$filePath}");
        }

        $mimeType = mime_content_type($filePath);
        $fileName = basename($filePath);

        // PHP 5.5+ 使用 CURLFile
        $postFields = [
            'file' => new \CURLFile($filePath, $mimeType, $fileName),
        ];

        if ($targetDir !== '') {
            $postFields['targetDir'] = $targetDir;
        }

        return $this->request('POST', '/admin/api/upload', [
            'multipart' => $postFields,
        ]);
    }

    /**
     * 上传文件内容（适用于内存中的图片数据）
     *
     * @param string $data       图片二进制数据
     * @param string $fileName   文件名
     * @param string $targetDir  目标目录
     */
    public function uploadData(string $data, string $fileName, string $targetDir = ''): array
    {
        // 写入临时文件
        $tmpFile = tempnam(sys_get_temp_dir(), 'img_');
        file_put_contents($tmpFile, $data);

        try {
            $result = $this->upload($tmpFile, $targetDir);
            unlink($tmpFile);
            return $result;
        } catch (\Exception $e) {
            unlink($tmpFile);
            throw $e;
        }
    }

    // ========== 删除 ==========

    public function delete(string $path): array
    {
        return $this->request('DELETE', '/admin/api/files', [
            'json' => ['path' => $path],
        ]);
    }

    // ========== 分享 ==========

    /**
     * 生成分享链接
     *
     * @param string $path    文件路径
     * @param int    $expires 有效期（秒），默认 86400（24 小时）
     */
    public function share(string $path, int $expires = 86400): array
    {
        return $this->request('POST', '/admin/api/files/share', [
            'json' => ['path' => $path, 'expires' => $expires],
        ]);
    }

    // ========== 文件列表 ==========

    public function listFiles(string $path = '/', string $search = '', int $page = 1, int $limit = 50): array
    {
        $query = ['path' => $path, 'page' => $page, 'limit' => $limit];
        if ($search !== '') {
            $query['search'] = $search;
        }

        return $this->request('GET', '/admin/api/files', ['query' => $query]);
    }

    // ========== 统计 ==========

    public function stats(): array
    {
        return $this->request('GET', '/admin/api/stats');
    }

    // ========== 签名 URL（静态方法） ==========

    /**
     * 生成带 HMAC 签名的访问 URL
     *
     * 签名算法：HMAC-SHA256，Base64URL 编码（无填充）
     * 签名消息：{path}|{exp}
     *
     * @param string $baseUrl    图床域名
     * @param string $path       文件路径，以 / 开头
     * @param string $secret     SIGN_SECRET 密钥
     * @param int    $expiresIn  有效期（秒）
     */
    public static function generateSignedUrl(
        string $baseUrl,
        string $path,
        string $secret,
        int $expiresIn = 3600
    ): string {
        $exp = time() + $expiresIn;
        $message = "{$path}|{$exp}";

        $sig = hash_hmac('sha256', $message, $secret, true);

        // Base64URL 编码（无填充）
        $sig = rtrim(strtr(base64_encode($sig), '+/', '-_'), '=');

        return rtrim($baseUrl, '/') . "{$path}?sig={$sig}&exp={$exp}";
    }
}
```

---

## 上传图片

```php
<?php

require_once 'ImageHost.php';

$client = new ImageHost('https://img.example.com', '<你的API令牌>');

// 上传到根目录
$result = $client->upload('photo.jpg');
echo "上传成功: {$result['fullUrl']}\n";

// 上传到指定目录
$result = $client->upload('photo.jpg', 'blog/2025');
echo "上传成功: {$result['fullUrl']}\n";

// 检测去重
if (!empty($result['deduplicated'])) {
    echo "检测到重复图片，已返回已有链接\n";
}

// 上传内存中的图片（如 GD 生成的图片）
$image = imagecreatetruecolor(100, 100);
$red = imagecolorallocate($image, 255, 0, 0);
imagefill($image, 0, 0, $red);

ob_start();
imagepng($image);
$data = ob_get_clean();
imagedestroy($image);

$result = $client->uploadData($data, 'generated.png');
echo "上传成功: {$result['fullUrl']}\n";
```

---

## 删除文件

```php
$client->delete('/images/photo.jpg');
```

---

## 生成分享链接

```php
// 24 小时有效
$result = $client->share('/images/photo.jpg', 86400);
echo "分享链接: {$result['url']}\n";

// 7 天有效
$result = $client->share('/images/photo.jpg', 604800);
```

---

## 生成签名 URL

当需要访问受保护的图片（`/private/`、`/draft/`、`/raw/` 路径，或全局签名开启时），需要生成带签名的 URL。

```php
<?php

$url = ImageHost::generateSignedUrl(
    'https://img.example.com',
    '/private/secret.jpg',
    '<你的SIGN_SECRET>',
    86400  // 24 小时
);

echo $url;
// => https://img.example.com/private/secret.jpg?sig=xxx&exp=1717200000
```

**签名算法**：HMAC-SHA256，输出 Base64URL 编码（无填充 `=`，`+` 替换为 `-`，`/` 替换为 `_`）。

**签名消息**：`{path}|{exp}`

---

## 批量上传

```php
<?php

function batchUpload(ImageHost $client, string $directory, string $targetDir = '')
{
    $extensions = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'];
    $files = glob($directory . '/*.{' . implode(',', $extensions) . '}', GLOB_BRACE);

    foreach ($files as $filePath) {
        try {
            $result = $client->upload($filePath, $targetDir);
            if (!empty($result['deduplicated'])) {
                echo "跳过重复: {$filePath} -> {$result['fullUrl']}\n";
            } else {
                echo "上传成功: {$filePath} -> {$result['fullUrl']}\n";
            }
        } catch (\Exception $e) {
            echo "上传失败: {$filePath} - {$e->getMessage()}\n";
        }
    }
}

$client = new ImageHost('https://img.example.com', '<你的API令牌>');
batchUpload($client, './images', 'batch-upload');
```

---

## 完整示例

```php
<?php

class ImageHost
{
    private string $baseUrl;
    private string $token;

    public function __construct(string $baseUrl, string $token)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->token = $token;
    }

    private function request(string $method, string $path, array $options = []): array
    {
        $url = $this->baseUrl . $path;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        $headers = ["Authorization: Bearer {$this->token}"];

        if ($method === 'POST' || $method === 'DELETE') {
            if (isset($options['json'])) {
                $body = json_encode($options['json']);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
                $headers[] = 'Content-Type: application/json';
            } elseif (isset($options['multipart'])) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $options['multipart']);
            }
        }
        if (isset($options['query'])) {
            curl_setopt($ch, CURLOPT_URL, $url . '?' . http_build_query($options['query']));
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) throw new \RuntimeException("请求失败: {$error}");
        $data = json_decode($response, true);
        if ($httpCode >= 400) {
            throw new \RuntimeException("请求失败 [{$httpCode}]: " . ($data['error'] ?? $response));
        }
        return $data ?? [];
    }

    public function upload(string $filePath, string $targetDir = ''): array
    {
        if (!file_exists($filePath)) throw new \InvalidArgumentException("文件不存在: {$filePath}");
        $postFields = ['file' => new \CURLFile($filePath, mime_content_type($filePath), basename($filePath))];
        if ($targetDir !== '') $postFields['targetDir'] = $targetDir;
        return $this->request('POST', '/admin/api/upload', ['multipart' => $postFields]);
    }

    public function delete(string $path): array
    {
        return $this->request('DELETE', '/admin/api/files', ['json' => ['path' => $path]]);
    }

    public function share(string $path, int $expires = 86400): array
    {
        return $this->request('POST', '/admin/api/files/share', [
            'json' => ['path' => $path, 'expires' => $expires],
        ]);
    }

    public static function generateSignedUrl(
        string $baseUrl,
        string $path,
        string $secret,
        int $expiresIn = 3600
    ): string {
        $exp = time() + $expiresIn;
        $sig = hash_hmac('sha256', "{$path}|{$exp}", $secret, true);
        $sig = rtrim(strtr(base64_encode($sig), '+/', '-_'), '=');
        return rtrim($baseUrl, '/') . "{$path}?sig={$sig}&exp={$exp}";
    }
}


// ========== 使用示例 ==========

$client = new ImageHost('https://img.example.com', '<你的API令牌>');

// 上传图片
$result = $client->upload('photo.jpg', 'blog/2025');
echo "上传成功: {$result['fullUrl']}\n";

// 生成签名 URL
$signedUrl = ImageHost::generateSignedUrl(
    'https://img.example.com',
    $result['path'],
    '<你的SIGN_SECRET>',
    86400
);
echo "签名 URL: {$signedUrl}\n";
```