/**
 * Image Resize Worker — types
 *
 * Internal Worker, invoked by img-proxy via service binding.
 * No outbound bindings of its own.
 */
export interface Env {
  /**
   * Shared secret used to authenticate requests. img-proxy injects this
   * as `X-Api-Key` on service-binding calls; the public route
   * (resize.img.yuuverne.site) must present the same key.
   */
  RESIZE_API_KEY?: string;
}

export type InputFormat = 'jpeg' | 'png';

export type FitMode = 'cover' | 'contain' | 'fill' | 'inside';

export type ResizeFilter = 'box' | 'hamming' | 'lanczos2' | 'lanczos3' | 'mks2013';

export interface ResizeRequest {
  /** Source image bytes (raw JPEG/PNG). */
  image: ArrayBuffer | Uint8Array;
  /** Source format hint. If omitted, detected from magic bytes. */
  format?: InputFormat;
  /** Target width. At least one of width/height required. */
  width?: number;
  /** Target height. Omit to preserve aspect ratio. */
  height?: number;
  /** WebP quality 1-100. Default 80. Ignored when lossless=true. */
  quality?: number;
  /** Scaling mode. Default 'cover'. */
  fit?: FitMode;
  /** Resampling filter. Default 'lanczos3'. */
  filter?: ResizeFilter;
  /** Lossless WebP output. Default false. */
  lossless?: boolean;
  /** Unsharp mask amount 0-100. 0 disables. Default 0. */
  unsharpAmount?: number;
  /** Unsharp radius in px. Default 0.6. */
  unsharpRadius?: number;
  /** Unsharp threshold 0-255. Default 0. */
  unsharpThreshold?: number;
}

export interface DecodedImage {
  data: Uint8Array;   // RGBA, 4 bytes/pixel
  width: number;
  height: number;
}

export interface ResizeError {
  error: string;
}
