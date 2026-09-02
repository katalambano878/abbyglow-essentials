import sharp from 'sharp';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 80;

const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml', 'image/svg']);

function isImageType(contentType: string) {
  return contentType.toLowerCase().startsWith('image/');
}

/**
 * Compress uploaded images on the server (resize + quality).
 * Non-images and animated GIFs are returned unchanged.
 */
export async function compressUploadedImage(
  buf: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  if (!isImageType(type) || SKIP_TYPES.has(type) || buf.length < 8) {
    return { buffer: buf, contentType: type || contentType };
  }

  try {
    const pipeline = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    const needsResize = (meta.width || 0) > MAX_EDGE || (meta.height || 0) > MAX_EDGE;
    const image = needsResize
      ? pipeline.resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      : pipeline;

    let out: Buffer;
    let outType = type;

    if (type === 'image/png') {
      out = await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    } else if (type === 'image/webp') {
      out = await image.webp({ quality: WEBP_QUALITY }).toBuffer();
    } else {
      out = await image.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
      outType = 'image/jpeg';
    }

    if (out.length >= buf.length && !needsResize) {
      return { buffer: buf, contentType: type };
    }

    return { buffer: out, contentType: outType };
  } catch {
    return { buffer: buf, contentType: type || contentType };
  }
}
