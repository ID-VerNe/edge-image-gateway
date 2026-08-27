<?php
/**
 * image-resize-php
 *
 * PHP GD-based image resize server for Edge Image Gateway.
 * Replaces the Cloudflare Workers WASM resize worker (which exceeds
 * 10ms CPU limit for 24MP images on the free plan).
 *
 * Receives image bytes via POST, resizes with GD's `imagecopyresampled`,
 * and returns WebP output.
 *
 * Two body formats:
 *   1. Raw binary body (Content-Type: application/octet-stream)
 *      Params from query string: w, h, q, fit, lossless
 *   2. JSON body: { image: "<base64>", width, height, quality, fit, lossless }
 *
 * Query params / JSON fields:
 *   w / width       — target width (px)
 *   h / height      — target height (px)
 *   q / quality     — WebP quality 1-100 (default 80)
 *   fit             — cover | contain | inside | fill (default cover)
 *   lossless        — 1/true for lossless WebP
 *
 * Auth: X-Api-Key header or ?key= query param.
 *
 * Returns: 200 image/webp, 401 unauthorized, 413 too large, 415 bad format,
 *          422 bad params, 500 server error.
 */

// ─── Config ──────────────────────────────────────────────────────────────────
define('MAX_INPUT_PIXELS', 24_000_000);  // 24MP (e.g. 4000×6000)
define('MAX_DIM', 8000);                 // Long edge cap
define('UNSHARP_MAX_PX', 8_000_000);     // Unsharp only for ≤8MP target

// ⚠️ Set this to your RESIZE_API_KEY value (same as the old worker).
// In production, read from environment or a config file outside web root.
$API_KEY = '_cR4R421WwktWo85UooDs7TRMOTytnFK';

// ─── POST size check ─────────────────────────────────────────────────────────
// PHP's built-in server may silently truncate the body if post_max_size is too
// small. We detect this by comparing Content-Length against what we received.
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
$rawInput = file_get_contents('php://input');
$receivedLen = strlen($rawInput);
if ($contentLength > 0 && $receivedLen < $contentLength) {
    jsonError(
        "request body truncated: received {$receivedLen} of {$contentLength} bytes"
        . " (try increasing post_max_size/upload_max_filesize in php.ini)",
        413
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonError(string $msg, int $status): never {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $msg]);
    exit;
}

function detectFormat(string $bytes): ?string {
    if (strlen($bytes) < 8) return null;
    if (ord($bytes[0]) === 0xFF && ord($bytes[1]) === 0xD8 && ord($bytes[2]) === 0xFF) return 'jpeg';
    $pngSig = "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A";
    if (str_starts_with($bytes, $pngSig)) return 'png';
    return null;
}

function numVal($v): ?float {
    if ($v === null || $v === '' || $v === false) return null;
    if (is_numeric($v)) return (float)$v;
    return null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['key'] ?? '';
if ($API_KEY !== '' && $providedKey !== $API_KEY) {
    jsonError('unauthorized', 401);
}

// ─── Parse request ───────────────────────────────────────────────────────────

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';

if (str_contains($contentType, 'application/json')) {
    $input = file_get_contents('php://input');
    $body = json_decode($input, true);
    if (!$body || !isset($body['image'])) {
        jsonError('json body must contain "image" field', 400);
    }
    $imageBytes = base64_decode($body['image'], true);
    if ($imageBytes === false) {
        jsonError('image field must be valid base64', 400);
    }
    $width   = numVal($body['width'] ?? null);
    $height  = numVal($body['height'] ?? null);
    $quality = numVal($body['quality'] ?? null);
    $fit     = $body['fit'] ?? 'cover';
    $lossless = !empty($body['lossless']);
} else {
    // Raw binary body
    $imageBytes = file_get_contents('php://input');
    if ($imageBytes === false || strlen($imageBytes) === 0) {
        jsonError('empty request body', 400);
    }
    $width   = numVal($_GET['w'] ?? $_GET['width'] ?? null);
    $height  = numVal($_GET['h'] ?? $_GET['height'] ?? null);
    $quality = numVal($_GET['q'] ?? $_GET['quality'] ?? null);
    $fit     = $_GET['fit'] ?? 'cover';
    $lossless = ($_GET['lossless'] ?? '') === '1' || ($_GET['lossless'] ?? '') === 'true';
}

$quality = $quality ?? 80;
$quality = max(1, min(100, (int)$quality));

// ─── Detect format ───────────────────────────────────────────────────────────

$fmt = detectFormat($imageBytes);
if (!$fmt) {
    jsonError('unsupported input format', 415);
}

// ─── Decode ──────────────────────────────────────────────────────────────────

$src = null;
$srcW = 0;
$srcH = 0;
$hasAlpha = false;

if ($fmt === 'jpeg') {
    $src = @imagecreatefromstring($imageBytes);
    if (!$src) jsonError('jpeg decode failed', 422);
} elseif ($fmt === 'png') {
    $src = @imagecreatefromstring($imageBytes);
    if (!$src) jsonError('png decode failed', 422);
    // Preserve alpha for PNG
    $hasAlpha = true;
    imagepalettetotruecolor($src);
    imagealphablending($src, true);
    imagesavealpha($src, true);
}

$srcW = imagesx($src);
$srcH = imagesy($src);

// Check input bounds
if ($srcW > MAX_DIM || $srcH > MAX_DIM || ($srcW * $srcH) > MAX_INPUT_PIXELS) {
    imagedestroy($src);
    jsonError("input image too large: {$srcW}x{$srcH}", 413);
}

// ─── Compute target ──────────────────────────────────────────────────────────

if (!$width && !$height) {
    imagedestroy($src);
    jsonError('width or height required', 422);
}

$aspect = $srcW / $srcH;

switch ($fit) {
    case 'cover':
        if ($width && $height) {
            $scale = max($width / $srcW, $height / $srcH);
            $tW = (int)round($srcW * $scale);
            $tH = (int)round($srcH * $scale);
        } elseif ($width) {
            $tW = (int)$width;
            $tH = (int)round($tW / $aspect);
        } else {
            $tH = (int)$height;
            $tW = (int)round($tH * $aspect);
        }
        break;
    case 'contain':
    case 'inside':
        if ($width && $height) {
            $scale = min($width / $srcW, $height / $srcH);
            $tW = (int)round($srcW * $scale);
            $tH = (int)round($srcH * $scale);
        } elseif ($width) {
            $tW = (int)$width;
            $tH = (int)round($tW / $aspect);
        } else {
            $tH = (int)$height;
            $tW = (int)round($tH * $aspect);
        }
        break;
    case 'fill':
        $tW = $width ? (int)$width : (int)round(($height ?: 1) * $aspect);
        $tH = $height ? (int)$height : (int)round($tW / $aspect);
        break;
    default:
        imagedestroy($src);
        jsonError("unsupported fit: {$fit}", 422);
}

$tW = max(1, $tW);
$tH = max(1, $tH);

if ($tW > MAX_DIM || $tH > MAX_DIM) {
    imagedestroy($src);
    jsonError("target exceeds " . MAX_DIM . "px", 422);
}

// ─── Resize ──────────────────────────────────────────────────────────────────

$targetPx = $tW * $tH;

// If no resize needed, output directly
if ($tW === $srcW && $tH === $srcH) {
    $dst = $src;
} else {
    $dst = imagecreatetruecolor($tW, $tH);
    if (!$dst) {
        imagedestroy($src);
        jsonError('failed to create destination image', 500);
    }
    if ($hasAlpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
    } else {
        // Fill with white background (JPEG input, no transparency)
        $bg = imagecolorallocate($dst, 255, 255, 255);
        imagefill($dst, 0, 0, $bg);
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $tW, $tH, $srcW, $srcH);

    // ─── Unsharp mask (only for ≤8MP target) ────────────────────────────────
    // GD doesn't have a built-in unsharp mask, so we skip this for now.
    // A simple unsharp mask can be implemented with imageconvolution() if needed.
    imagedestroy($src);
}

// ─── Encode WebP ─────────────────────────────────────────────────────────────

if ($lossless) {
    $webpQuality = -1;  // GD: -1 means lossless
} else {
    $webpQuality = $quality;
}

ob_start();
$encoded = imagewebp($dst, null, $webpQuality);
$webpBytes = ob_get_clean();
imagedestroy($dst);

if (!$encoded || $webpBytes === false) {
    jsonError('webp encode failed', 500);
}

header('Content-Type: image/webp');
header('Cache-Control: no-store');
header('X-Resize-Source: ' . $srcW . 'x' . $srcH);
header('X-Resize-Target: ' . $tW . 'x' . $tH);
echo $webpBytes;