import { mkdir, open, readFile, writeFile, rename, unlink, readdir, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import prisma from './prisma';
import { saveFile, deleteFile, uploadPath, MAX_BATCH_BYTES } from './storage';
import { parseImportTarget, type ImportProvider } from './import-source';
import { withSourceBrowser } from './import-browser';

const userId = '00000000-0000-0000-0000-000000000000';
const stateDirectory = () => process.env.DREAMSTATION_STATE_DIR || join(process.cwd(), '.release', 'state');
const draftDirectory = () => join(stateDirectory(), 'import-drafts');
export const importDownloadDirectory = () => join(stateDirectory(), 'downloads');
type DraftItem = { id: string; kind: 'IMAGE' | 'VIDEO'; mediaUrl: string; original: string; resized: string | null; thumbnail: string | null; size: number; mime: string; sha256: string; creator?: string; caption?: string };
type Draft = { id: string; provider: ImportProvider; sourceUrl: string; expiresAt: number; items: DraftItem[]; committed?: boolean };
type SourceRecord = Record<string, unknown> & { assetId: string; sha256?: string };
const uuidPattern = /^[a-f0-9-]{36}$/i;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
async function atomicJson(path: string, value: unknown) {
  const temp = path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
async function locked<T>(action: () => Promise<T>): Promise<T> {
  await mkdir(stateDirectory(), { recursive: true, mode: 0o700 });
  const path = join(stateDirectory(), 'media-import.lock');
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const lock = await readJson<{ pid: number } | null>(path, null).catch(() => null);
    if (lock?.pid && Number.isInteger(lock.pid) && lock.pid > 0) {
      try { process.kill(lock.pid, 0); }
      catch (check) { if ((check as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(path); return locked(action); } }
    }
    throw new Error('Another media import is running. Try again when it finishes.');
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); return await action(); }
  finally { await handle.close(); await unlink(path).catch(() => {}); }
}

export async function getImportPreference() {
  const preferences = await readJson<{ excludedThemes?: string[] }>(join(stateDirectory(), 'curation-preferences.json'), {});
  return Array.isArray(preferences.excludedThemes) ? preferences.excludedThemes.filter(value => typeof value === 'string').slice(0, 10) : [];
}
async function checkPreference(caption: string, hash?: string) {
  const themes = await getImportPreference();
  if (themes.some(theme => /demon|occult/i.test(theme)) && /\b(demon(?:ic|s)?|satan(?:ic|ism)?|devils?|baphomet|pentagrams?|hellspawn|lucifer|antichrist|witchcraft|occult)\b/i.test(caption)) {
    throw new Error('This post matches your excluded demonic or occult styling preference.');
  }
  if (hash) {
    const excluded = await readJson<{ sha256?: string }[]>(join(stateDirectory(), 'excluded-media.json'), []);
    if (excluded.some(item => item.sha256 === hash)) throw new Error('This file was excluded from your collection previously.');
  }
}
async function discardFiles(draft: Draft) {
  // A crash after the database commit must never turn expiry cleanup into data loss.
  const referenced = await prisma.asset.findMany({ where: { originalUrl: { in: draft.items.map(item => item.original) } }, select: { originalUrl: true, resizedUrl: true, thumbnailUrl: true } });
  const retained = new Set(referenced.flatMap(item => [item.originalUrl, item.resizedUrl, item.thumbnailUrl]));
  await Promise.allSettled(draft.items.flatMap(item => [item.original, item.resized, item.thumbnail]).filter((url): url is string => !!url && !retained.has(url)).map(deleteFile));
}
async function cleanExpiredDrafts() {
  await mkdir(draftDirectory(), { recursive: true, mode: 0o700 });
  for (const name of await readdir(draftDirectory())) {
    if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
    const path = join(draftDirectory(), name);
    const draft = await readJson<Draft | null>(path, null);
    if (draft && draft.expiresAt < Date.now()) {
      const referenced = await prisma.asset.count({ where: { originalUrl: { in: draft.items.map(item => item.original) } } });
      if (referenced && !draft.committed) continue;
      if (draft.committed) {
        const ledger = await readJson<SourceRecord[]>(join(stateDirectory(), 'library-sources.json'), []);
        if (draft.items.some(item => !ledger.some(record => record.sha256 === item.sha256))) continue;
      }
      if (!draft.committed) await discardFiles(draft);
      await unlink(path);
    }
  }
}

export async function prepareUrlImport(url: string) {
  const target = parseImportTarget(url);
  return locked(async () => {
    await cleanExpiredDrafts();
    const draft: Draft = { id: randomUUID(), provider: target.provider, sourceUrl: target.url, expiresAt: Date.now() + 24 * 60 * 60 * 1000, items: [] };
    try {
      await withSourceBrowser(target, async (media, download) => {
        let total = 0;
        for (const source of media) {
          await checkPreference(source.caption || '');
          const { bytes, mime } = await download(source.url);
          total += bytes.length;
          if (total > MAX_BATCH_BYTES) throw new Error('This post exceeds the 100 MB batch limit. Use a link to a single image or video.');
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          await checkPreference(source.caption || '', sha256);
          if (draft.items.some(item => item.sha256 === sha256)) continue;
          const urls = await saveFile(new File([new Uint8Array(bytes)], 'source-media', { type: mime }));
          draft.items.push({ ...urls, id: randomUUID(), kind: mime.startsWith('video/') ? 'VIDEO' : 'IMAGE', mediaUrl: source.url, mime, size: bytes.length, sha256, creator: source.creator, caption: source.caption });
        }
      });
      if (!draft.items.length) throw new Error('No downloadable media was found in this post.');
      await atomicJson(join(draftDirectory(), draft.id + '.json'), draft);
      return { id: draft.id, provider: draft.provider, sourceUrl: draft.sourceUrl, excludedThemes: await getImportPreference(), items: draft.items.map(item => ({ id: item.id, kind: item.kind, originalUrl: item.original, thumbnailUrl: item.thumbnail, size: item.size })) };
    } catch (error) { await discardFiles(draft); throw error; }
  });
}

async function loadDraft(id: string): Promise<Draft> {
  if (!uuidPattern.test(id)) throw new Error('This import preview is invalid. Fetch the link again.');
  const draft = await readJson<Draft | null>(join(draftDirectory(), id + '.json'), null);
  if (!draft || draft.expiresAt < Date.now()) throw new Error('This import preview expired. Fetch the link again.');
  return draft;
}

export async function commitUrlImport(id: string, selectedIds: string[], options: { collectionId?: string; collectionName?: string } = {}) {
  return locked(async () => {
    const draft = await loadDraft(id);
    if (draft.committed) throw new Error('This preview was already imported.');
    if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.some(value => typeof value !== 'string' || !draft.items.some(item => item.id === value))) throw new Error('Choose at least one of the previewed files.');
    const chosen = draft.items.filter(item => selectedIds.includes(item.id));
    for (const item of chosen) await checkPreference(item.caption || '', item.sha256);
    if (options.collectionName && (!options.collectionName.trim() || options.collectionName.length > 80)) throw new Error('Collection names must be 1–80 characters.');
    const ledgerPath = join(stateDirectory(), 'library-sources.json');
    const ledger = await readJson<SourceRecord[]>(ledgerPath, []);
    const assets = await prisma.asset.findMany({ where: { userId } });
    const active = new Map(assets.map(asset => [asset.id, asset]));
    const byHash = new Map<string, typeof assets[number]>();
    for (const source of ledger) if (source.sha256 && active.has(source.assetId)) byHash.set(source.sha256, active.get(source.assetId)!);
    const indexed = new Set([...byHash.values()].map(asset => asset.id));
    for (const asset of assets) if (!indexed.has(asset.id)) {
      const bytes = await readFile(uploadPath(asset.originalUrl));
      byHash.set(createHash('sha256').update(bytes).digest('hex'), asset);
    }
    const groupName = options.collectionName?.trim() || (draft.provider === 'X' ? 'X Favorites' : draft.provider === 'Midjourney' ? 'Midjourney Discoveries' : 'Grok Imagine');
    const result = await prisma.$transaction(async tx => {
      const playlist = options.collectionId
        ? await tx.playlist.findUniqueOrThrow({ where: { id: options.collectionId, userId } })
        : await tx.playlist.findFirst({ where: { userId, name: groupName } }) || await tx.playlist.create({ data: { userId, name: groupName } });
      let nextOrder = (await tx.playlistItem.findFirst({ where: { playlistId: playlist.id }, orderBy: { sortOrder: 'desc' } }))?.sortOrder ?? -1;
      const saved = [];
      for (const item of chosen) {
        const existing = byHash.get(item.sha256);
        const asset = existing || await tx.asset.create({ data: { userId, kind: item.kind, originalUrl: item.original, resizedUrl: item.resized, thumbnailUrl: item.thumbnail, size: item.size } });
        if (!(await tx.playlistItem.findFirst({ where: { playlistId: playlist.id, assetId: asset.id } }))) await tx.playlistItem.create({ data: { playlistId: playlist.id, assetId: asset.id, sortOrder: ++nextOrder } });
        saved.push({ item, asset, reused: !!existing });
      }
      return { playlist, saved };
    });
    // Mark ownership of committed files before any optional metadata write or cleanup.
    const retained = new Set(result.saved.filter(item => !item.reused).map(item => item.item.id));
    const discard = { ...draft, items: draft.items.filter(item => !retained.has(item.id)) };
    draft.items = result.saved.map(({ item, asset }) => ({ ...item, original: asset.originalUrl, resized: asset.resizedUrl, thumbnail: asset.thumbnailUrl }));
    draft.committed = true;
    try { await atomicJson(join(draftDirectory(), draft.id + '.json'), draft); }
    catch (error) { console.error('Imported media is committed; its source draft could not be updated:', error); }
    await discardFiles(discard);
    const nextLedger = ledger.filter(source => active.has(source.assetId));
    for (const { item, asset } of result.saved) if (!nextLedger.some(source => source.assetId === asset.id)) nextLedger.push({ assetId: asset.id, sha256: item.sha256, sourcePage: draft.sourceUrl, mediaUrl: item.mediaUrl, platform: draft.provider, creator: item.creator, caption: item.caption, originalUrl: asset.originalUrl, size: item.size, mime: item.mime, kind: item.kind, importedAt: new Date().toISOString() });
    try { await atomicJson(ledgerPath, nextLedger); }
    catch (error) { console.error('Imported media is committed; source metadata remains in the import draft:', error); }
    return { added: result.saved.filter(item => !item.reused).length, reused: result.saved.filter(item => item.reused).length, collection: result.playlist.name, assets: result.saved.map(item => item.asset) };
  });
}

export async function exportUrlImport(id: string, outputDirectory: string) {
  return locked(async () => {
    const draft = await loadDraft(id);
    await mkdir(outputDirectory, { recursive: true });
    const paths: string[] = [];
    for (const item of draft.items) {
      const path = join(/* turbopackIgnore: true */ outputDirectory, item.sha256 + '.' + basename(item.original).split('.').at(-1));
      await copyFile(uploadPath(item.original), path);
      paths.push(path);
    }
    await atomicJson(join(outputDirectory, 'sources-' + draft.id + '.json'), { provider: draft.provider, sourceUrl: draft.sourceUrl, items: draft.items.map((item, i) => ({ file: paths[i], mediaUrl: item.mediaUrl, sha256: item.sha256, kind: item.kind, creator: item.creator })) });
    if (!draft.committed) { await discardFiles(draft); await unlink(join(draftDirectory(), draft.id + '.json')); }
    return paths;
  });
}

export function publicImportError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^(Paste |Enter |Use |The (source|import|media)|No downloadable|This (post|file|import|preview)|Another media|Choose |Collection names|Could not (connect|decode)|Supported formats|Each file)/.test(message) ? message : 'Could not import this link. Check the source browser and try again.';
}
