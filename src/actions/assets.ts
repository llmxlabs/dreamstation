'use server';

import prisma from '@/lib/prisma';
import { saveFile, deleteFile, validateFile, MAX_BATCH_BYTES } from '@/lib/storage';
import { revalidatePath } from 'next/cache';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function uploadAsset(formData: FormData) {
  const files = formData.getAll('file');
  const saved: Awaited<ReturnType<typeof saveFile>>[] = [];
  let committed = false;
  try {
    if (!files.length || files.length > 20) throw new Error('Choose between 1 and 20 files.');
    let total = 0;
    for (const entry of files) {
      if (!(entry instanceof File)) throw new Error('Invalid upload.');
      validateFile(entry);
      total += entry.size;
    }
    if (total > MAX_BATCH_BYTES) throw new Error('Upload batches must be 100 MB or smaller.');
    for (const file of files as File[]) saved.push(await saveFile(file));
    const assets = await prisma.$transaction(saved.map((urls, i) => prisma.asset.create({ data: {
      userId: DEFAULT_USER_ID,
      kind: (files[i] as File).type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      originalUrl: urls.original, resizedUrl: urls.resized, thumbnailUrl: urls.thumbnail,
      size: (files[i] as File).size,
    } })));
    committed = true;
    try { revalidatePath('/'); } catch { /* Client refresh events still update the gallery. */ }
    return { success: true, assets };
  } catch (error) {
    if (!committed) await Promise.allSettled(saved.flatMap(item => [item.original, item.resized, item.thumbnail].filter((url): url is string => !!url)).map(deleteFile));
    const publicErrors = new Set([
      'Choose between 1 and 20 files.', 'Invalid upload.',
      'Choose a non-empty image or video.', 'Each file must be 50 MB or smaller.',
      'Supported formats: JPG, PNG, WebP, MP4 and WebM.', 'Upload batches must be 100 MB or smaller.',
      'The image contents do not match its file type.', 'The video contents do not match its file type.',
      'Could not decode this video. Use an MP4 (H.264) or WebM file.',
      'Could not decode this image. Use a JPG, PNG or WebP image under 40 megapixels.',
    ]);
    const safeError = error instanceof Error && publicErrors.has(error.message) ? error.message : 'Upload failed. Check database setup and available disk space.';
    return { success: false, error: safeError };
  }
}

export async function deleteAsset(assetId: string) {
  try {
    const asset = await prisma.asset.findFirst({ where: { id: assetId, userId: DEFAULT_USER_ID } });
    if (!asset) return { success: false, error: 'Asset not found' };
    await prisma.$transaction([
      prisma.playlistItem.deleteMany({ where: { assetId } }),
      prisma.asset.delete({ where: { id: assetId } }),
    ]);
    // Database references disappear atomically before physical cleanup.
    const cleanup = await Promise.allSettled([asset.originalUrl, asset.resizedUrl, asset.thumbnailUrl].filter((url): url is string => !!url).map(deleteFile));
    if (cleanup.some(result => result.status === 'rejected')) console.warn('An unused media file could not be removed. Check storage permissions.');
    try { revalidatePath('/'); } catch {}
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete asset' };
  }
}
export async function getAssets() {
  return prisma.asset.findMany({ where: { userId: DEFAULT_USER_ID }, orderBy: { createdAt: 'desc' } });
}
