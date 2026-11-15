import { heicTo } from 'heic-to';
import heic2any from 'heic2any';

const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_RE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;

export function isHeicFile(file: File): boolean {
  return HEIC_MIME_RE.test(file.type || '') || HEIC_EXT_RE.test(file.name);
}

async function detectActualBrowserImageMime(file: File): Promise<string | null> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47)
    return 'image/png';
  // GIF: 47 49 46 38
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38)
    return 'image/gif';
  // RIFF....WEBP
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

async function convertViaServerFallback(file: File): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file for conversion.'));
    reader.readAsDataURL(file);
  });

  const resp = await fetch('/api/media/convert-heic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: dataUrl }),
  });

  if (!resp.ok) {
    const payload = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'Server HEIC conversion failed.');
  }

  const { dataUrl: convertedDataUrl } = (await resp.json()) as { dataUrl: string };
  const blobResp = await fetch(convertedDataUrl);
  const blob = await blobResp.blob();
  return new File([blob], file.name.replace(HEIC_EXT_RE, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  // 0. Check if file is actually already a JPEG/PNG/WebP/GIF saved with a .heic extension
  const actualMime = await detectActualBrowserImageMime(file);
  if (actualMime) {
    const ext =
      actualMime === 'image/png'
        ? '.png'
        : actualMime === 'image/webp'
          ? '.webp'
          : actualMime === 'image/gif'
            ? '.gif'
            : '.jpg';
    return new File([file], file.name.replace(HEIC_EXT_RE, ext), {
      type: actualMime,
      lastModified: file.lastModified,
    });
  }

  // 1. Primary modern decoder: heic-to (libheif 1.23+, supports iOS 16/17/18 10-bit & HDR HEIC)
  try {
    const outputBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    });
    return new File([outputBlob], file.name.replace(HEIC_EXT_RE, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.warn('Primary heic-to decoder fell back:', err);
  }

  // 2. Secondary client decoder: heic2any
  try {
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    const outputBlob = Array.isArray(result) ? result[0] : result;
    return new File([outputBlob], file.name.replace(HEIC_EXT_RE, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.warn('Secondary heic2any decoder fell back:', err);
  }

  // 3. Server-side ImageMagick/libheif fallback
  try {
    return await convertViaServerFallback(file);
  } catch (serverErr) {
    const detail = serverErr instanceof Error ? serverErr.message : String(serverErr);
    throw new Error(`Could not decode "${file.name}": ${detail}`);
  }
}
