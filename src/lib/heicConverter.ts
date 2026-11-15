import heic2any from 'heic2any';

const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_RE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;

export function isHeicFile(file: File): boolean {
  return HEIC_MIME_RE.test(file.type || '') || HEIC_EXT_RE.test(file.name);
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  try {
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    const outputBlob = Array.isArray(result) ? result[0] : result;
    const nextName = file.name.replace(HEIC_EXT_RE, '.jpg');
    return new File([outputBlob], nextName, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (err) {
    // Some cameras save JPEG bytes inside a .heic filename; heic2any reports already readable.
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message)
          : String(err);

    if (msg.toLowerCase().includes('already browser readable')) {
      return new File([file], file.name.replace(HEIC_EXT_RE, '.jpg'), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    }

    throw new Error(`Could not decode HEIC file "${file.name}".`);
  }
}
