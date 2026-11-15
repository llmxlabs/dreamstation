'use server';
import { revalidatePath } from 'next/cache';
import { prepareUrlImport, commitUrlImport, publicImportError } from '@/lib/media-importer';

export async function previewUrlImport(url: string) {
  try { return { success: true as const, preview: await prepareUrlImport(url) }; }
  catch (error) { console.error('URL preview failed:', error); return { success: false as const, error: publicImportError(error) }; }
}
export async function addUrlImport(id: string, selectedIds: string[], collectionId?: string) {
  try {
    if (collectionId !== undefined && (typeof collectionId !== 'string' || collectionId.length > 128)) throw new Error('Choose a valid collection.');
    const result = await commitUrlImport(id, selectedIds, { collectionId: collectionId || undefined });
    try { revalidatePath('/'); } catch { /* The client refreshes after a successful import. */ }
    return { success: true as const, added: result.added, reused: result.reused, collection: result.collection };
  } catch (error) { console.error('URL import failed:', error); return { success: false as const, error: publicImportError(error) }; }
}

export async function importUrlToGallery(url: string, collectionId?: string) {
  const preview = await previewUrlImport(url);
  if (!preview.success) return preview;
  return addUrlImport(preview.preview.id, preview.preview.items.map(item => item.id), collectionId);
}
