'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Link2, Loader2, Download } from 'lucide-react';
import { previewUrlImport, addUrlImport, importUrlToGallery } from '@/actions/imports';
import { getPlaylists } from '@/actions/playlists';

type Preview = Extract<Awaited<ReturnType<typeof previewUrlImport>>, { success: true }>['preview'];

export default function UrlImportForm() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [collection, setCollection] = useState('');
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const data = await getPlaylists(); if (active) setGroups(data.map(group => ({ id: group.id, name: group.name }))); } catch { /* Source groups can still be created automatically. */ } };
    void refresh(); window.addEventListener('playlists-updated', refresh);
    return () => { active = false; window.removeEventListener('playlists-updated', refresh); };
  }, []);

  const finish = (result: { added: number; reused: number; collection: string }) => {
    setMessage(`${result.added} added to ${result.collection}.${result.reused ? ` ${result.reused} already in the gallery and reused.` : ''}`);
    setPreview(null); setSelected([]); setUrl('');
    window.dispatchEvent(new Event('assets-updated'));
    window.dispatchEvent(new Event('playlists-updated'));
  };

  const run = async (mode: 'import' | 'preview' | 'selected') => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'preview') {
        const result = await previewUrlImport(url);
        if (!result.success) throw new Error(result.error);
        setPreview(result.preview); setSelected(result.preview.items.map(item => item.id));
      } else {
        const result = mode === 'selected' && preview
          ? await addUrlImport(preview.id, selected, collection || undefined)
          : await importUrlToGallery(url, collection || undefined);
        if (!result.success) throw new Error(result.error);
        finish(result);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import this link.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <p className="text-xs leading-relaxed text-zinc-400">Paste an X post, Midjourney job, or Grok Imagine share link. Images and videos are saved to your local gallery.</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-cyan-300">
      <a href="https://www.midjourney.com/explore?tab=top" target="_blank" rel="noopener noreferrer" className="hover:underline">Browse Midjourney</a>
      <a href="https://x.com/search?q=url%3Agrok.com%2Fimagine%2Fpost&f=media" target="_blank" rel="noopener noreferrer" className="hover:underline">Grok posts on X</a>
    </div>
    <form onSubmit={event => { event.preventDefault(); void run('import'); }} className="space-y-3">
      <label className="block text-xs font-bold text-zinc-300">Post URL
        <input type="url" required value={url} onChange={event => { setUrl(event.target.value); setPreview(null); }} disabled={busy} placeholder="https://x.com/…/status/…" className="mt-2 w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs font-normal text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-50" />
      </label>
      <label className="block text-xs font-bold text-zinc-300">Add to group
        <select value={collection} onChange={event => setCollection(event.target.value)} disabled={busy} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-zinc-300">
          <option value="">Automatic source group</option>
          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy || !url.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-3 py-3 text-xs font-bold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? 'Fetching media…' : 'Import to DreamStation'}
      </button>
      <button type="button" disabled={busy || !url.trim()} onClick={() => void run('preview')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-cyan-300 disabled:opacity-40"><Link2 className="h-3.5 w-3.5" />Preview and choose files</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-cyan-500/10 p-3 text-xs leading-relaxed text-cyan-200">{message}</p>}
    {preview && <section aria-label="Import preview" className="space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs font-bold text-zinc-200">{preview.provider} · {preview.items.length} files</p>
      <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] text-cyan-300 hover:underline">Open original post</a>
      {!!preview.excludedThemes.length && <p className="text-[11px] leading-relaxed text-zinc-400">Your preference: no {preview.excludedThemes.join(' or ')}. Keep only the artwork you want to display.</p>}
      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {preview.items.map((item, index) => <div key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
          {item.kind === 'VIDEO' ? <video src={item.originalUrl} poster={item.thumbnailUrl || undefined} controls muted playsInline preload="metadata" className="max-h-48 w-full object-contain" /> : <Image src={item.thumbnailUrl || item.originalUrl} alt={`Artwork ${index + 1}`} width={400} height={400} unoptimized className="max-h-48 w-full object-contain" />}
          <div className="flex items-center justify-between gap-2 p-2.5">
            <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} className="accent-cyan-500" />{item.kind === 'VIDEO' ? 'Video' : 'Image'} {index + 1}</label>
            <a href={item.originalUrl} download={`dreamstation-${index + 1}.${item.originalUrl.split('.').at(-1)}`} className="text-[11px] text-cyan-300 hover:underline">Save file</a>
          </div>
        </div>)}
      </div>
      <button type="button" disabled={busy || !selected.length} onClick={() => void run('selected')} className="w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Add {selected.length} selected to gallery</button>
    </section>}
  </div>;
}
