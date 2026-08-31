import { COVER_MAX_HEIGHT, MAX_COVER_BYTES } from './novel.rules';

export type CoverCheck = 'ok' | 'notImage' | 'tooLarge';

const COVER_MIME = ['image/jpeg', 'image/png'];

const JPEG_QUALITY = 0.85;

export function checkCoverFile(file: File): CoverCheck {
  if (!COVER_MIME.includes(file.type)) {
    return 'notImage';
  }
  return file.size > MAX_COVER_BYTES ? 'tooLarge' : 'ok';
}

export function coverScale(height: number): number {
  return height > 0 ? Math.min(1, COVER_MAX_HEIGHT / height) : 1;
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareCover(file: File): Promise<string> {
  const image = await decodeImage(file);
  const scale = coverScale(image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas unavailable');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type, JPEG_QUALITY);
}
