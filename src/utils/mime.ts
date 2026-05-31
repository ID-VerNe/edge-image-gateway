const mimeTypes: Record<string, string> = {
  // Images
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'avif': 'image/avif',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  
  // Videos (often served from CDNs)
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogg': 'video/ogg',
  'mov': 'video/mp4', // usually mp4 but alias
  
  // Others
  'txt': 'text/plain',
  'pdf': 'application/pdf',
  'json': 'application/json'
};

export const getMimeType = (filename: string): string => {
  const parts = filename.split('.');
  if (parts.length < 2) return 'application/octet-stream';
  
  const ext = parts.pop()?.toLowerCase() || '';
  return mimeTypes[ext] || 'application/octet-stream';
};
