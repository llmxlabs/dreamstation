import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const uploadDirectory = () => join(process.cwd(), 'public', 'uploads');
const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm',
};
export function validateFile(file: File): void {
  if (!(file instanceof File) || !file.size) throw new Error('Choose a non-empty image or video.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Each file must be 50 MB or smaller.');
  if (!mimeExtensions[file.type]) throw new Error('Supported formats: JPG, PNG, WebP, MP4 and WebM.');
}
export function uploadPath(url: string): string {
  if (!url.startsWith('/uploads/') || /[\\\x00]/.test(url)) throw new Error('Invalid media path.');
  const name = url.slice('/uploads/'.length);
  if (!name || basename(name) !== name || name === '.' || name === '..') throw new Error('Invalid media path.');
  return join(uploadDirectory(), name);
}
export async function deleteFile(url: string): Promise<void> {
  try { await unlink(uploadPath(url)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
export async function saveFile(file: File): Promise<{ original: string; resized: string | null; thumbnail: string | null }> {
  validateFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const isVideo = file.type.startsWith('video/');
  // Never use a client filename as a filesystem path.
  const original = `/uploads/${id}${mimeExtensions[file.type]}`;
  const resized = isVideo ? null : `/uploads/${id}-res.webp`;
  const thumbnail = `/uploads/${id}-thumb.webp`;
  const created: string[] = [];
  await mkdir(uploadDirectory(), { recursive: true });
  try {
    if (!isVideo) {
      const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
      const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      if (metadata.format !== expected) throw new Error('The image contents do not match its file type.');
      created.push(resized!, thumbnail);
      await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(uploadPath(resized!));
      await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 75 }).toFile(uploadPath(thumbnail));
    } else {
      const validHeader = file.type === 'video/mp4'
        ? buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp'
        : buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (!validHeader) throw new Error('The video contents do not match its file type.');
    }
    created.push(original);
    await writeFile(uploadPath(original), buffer, { flag: 'wx' });
    if (isVideo) {
      created.push(thumbnail);
      const ffmpeg = join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      // Decode a real frame, restrict protocols and bound runtime; invalid videos are rejected.
      await exec(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', uploadPath(original), '-frames:v', '1', '-vf', 'scale=400:400:force_original_aspect_ratio=decrease', '-y', uploadPath(thumbnail)], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    }
    return { original, resized, thumbnail };
  } catch (error) {
    await Promise.allSettled(created.map(deleteFile));
    if (error instanceof Error && /match its file type/.test(error.message)) throw error;
    throw new Error(isVideo ? 'Could not decode this video. Use an MP4 (H.264) or WebM file.' : 'Could not decode this image. Use a JPG, PNG or WebP image under 40 megapixels.');
  }
}
