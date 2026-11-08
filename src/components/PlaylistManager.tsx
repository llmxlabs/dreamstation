'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlaylists, createPlaylist, addAssetToPlaylist, removeAssetFromPlaylist, deletePlaylist } from '@/actions/playlists';
import { getAssets } from '@/actions/assets';
import Image from 'next/image';
import { ListMusic, Plus, Trash2, FileVideo, Loader2, Layers, ChevronDown } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';

export default function PlaylistManager() {
  const [playlists, setPlaylists] = useState<Awaited<ReturnType<typeof getPlaylists>>>([]);
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof getAssets>>>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requests = useRef(0);

  const shouldReduceMotion = useReducedMotion();

  const fetchData = useCallback(async () => {
    const request = ++requests.current;
    try {
    const [pData, aData] = await Promise.all([getPlaylists(), getAssets()]);
    if (request !== requests.current) return;
    const playlists = pData || [];
    setPlaylists(playlists);
    setAssets(aData || []);
    // Default: collapsed if has items, expanded if empty
    setCollapsed((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const p of playlists) {
        if (!(p.id in next)) {
          next[p.id] = p.items.length > 0;
        }
      }
      return next;
    });
    } catch {
      setError('Could not load collections. Check the server and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load external server data when the collection panel mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    window.addEventListener('playlists-updated', fetchData);
    window.addEventListener('assets-updated', fetchData);
    const interval = setInterval(fetchData, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('playlists-updated', fetchData);
      window.removeEventListener('assets-updated', fetchData);
    };
  }, [fetchData]);

  const mutate = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.success) throw new Error(result.error || 'Could not update collection');
      window.dispatchEvent(new Event('playlists-updated'));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update collection. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setCreating(true);
    if (await mutate(() => createPlaylist(newPlaylistName.trim()))) {
      setNewPlaylistName('');
    }
    setCreating(false);
  };

  const handleAddAsset = async (playlistId: string, assetId: string) => {
    await mutate(() => addAssetToPlaylist(playlistId, assetId));
  };

  const handleRemoveAsset = async (playlistItemId: string) => {
    await mutate(() => removeAssetFromPlaylist(playlistItemId));
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this collection?')) return;
    await mutate(() => deletePlaylist(playlistId));
  };

  const collapseVariants: Variants = {
    open: {
      height: 'auto',
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0 }
        : { height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } },
    },
    closed: {
      height: 0,
      opacity: 0,
      transition: shouldReduceMotion
        ? { duration: 0 }
        : { height: { duration: 0.22, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.15, ease: 'easeIn' } },
    },
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Loading Playlists...</span>
      </div>
    );
  }

  return (
    <GlassPanel delay={0.2}>
      <div className="relative p-5">
        {error && <div role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}<button className="ml-2 underline" onClick={() => { setError(null); void fetchData(); }}>Retry</button></div>}

        {/* Prism header */}
        <div className="flex items-center gap-3 mb-8">
          {/* Prism gradient left-border pill */}
          <div className="relative flex items-center">
            <div
              className="absolute left-0 top-0 bottom-0 w-px rounded-full"
              style={{ background: 'linear-gradient(180deg, #22d3ee 0%, #8b5cf6 100%)' }}
            />
            <div
              className="ml-3 p-2 rounded-xl border border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(139,92,246,0.08) 100%)' }}
            >
              <Layers
                className="w-4 h-4"
                style={{ color: '#22d3ee' }}
              />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-black text-white tracking-tight uppercase">Curation</h2>
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Collections</span>
          </div>
        </div>

        {/* Create playlist form */}
        <form onSubmit={handleCreatePlaylist} className="mb-5">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="New collection name"
              maxLength={80}
              disabled={creating}
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="COLLECTION NAME"
              className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/40 transition-all"
            />
            <button
              type="submit"
              disabled={busy || creating || !newPlaylistName.trim()}
              aria-label="Create collection"
              className="p-2.5 rounded-xl text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: creating || !newPlaylistName.trim()
                  ? 'rgba(255,255,255,0.06)'
                  : 'linear-gradient(135deg, #22d3ee22 0%, #8b5cf622 100%)',
                border: '1px solid',
                borderColor: creating || !newPlaylistName.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(34,211,238,0.3)',
              }}
            >
              {creating
                ? <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                : <Plus className="w-5 h-5 text-cyan-400" />}
            </button>
          </div>
        </form>

        {/* Playlist cards */}
        <div className="space-y-3">
          {playlists.length === 0 ? (
            /* Empty state */
            <div className="py-16 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-black/10">
              <div
                className="p-4 rounded-2xl border border-white/10"
                style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.06) 0%, rgba(139,92,246,0.06) 100%)' }}
              >
                <ListMusic className="w-8 h-8 text-zinc-600" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-black text-zinc-400 uppercase tracking-tight">No Collections Yet</p>
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Name one above to get started</p>
              </div>
            </div>
          ) : (
            playlists.map((playlist) => {
              const isCollapsed = collapsed[playlist.id] ?? (playlist.items.length > 0);
              const availableCount = assets.filter(
                (a) => !playlist.items.some(i => i.assetId === a.id)
              ).length;

              return (
                <div
                  key={playlist.id}
                  className="rounded-2xl bg-white/[0.04] border border-white/[0.07] overflow-hidden group/item transition-colors hover:bg-white/[0.06]"
                >
                  {/* Card header row — always visible */}
                  <div className="flex items-center justify-between px-3 py-4">
                    {/* Left: name + meta */}
                    <button
                      onClick={() => toggleCollapsed(playlist.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                      aria-expanded={!isCollapsed}
                      aria-controls={`playlist-body-${playlist.id}`}
                    >
                      {/* Prism dot */}
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: 'linear-gradient(180deg, #22d3ee 0%, #8b5cf6 100%)' }}
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-tight truncate">
                          {playlist.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                            {playlist.items.length} ASSETS
                          </span>
                          {isCollapsed && availableCount > 0 && (
                            <span
                              className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                              style={{
                                color: '#22d3ee',
                                background: 'rgba(34,211,238,0.08)',
                                border: '1px solid rgba(34,211,238,0.15)',
                              }}
                            >
                              {availableCount} available
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Right: chevron + delete */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <motion.div
                        animate={{ rotate: isCollapsed ? 0 : 180 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <button
                          onClick={() => toggleCollapsed(playlist.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
                          aria-label={isCollapsed ? 'Expand playlist' : 'Collapse playlist'}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </motion.div>

                      <button
                        onClick={() => handleDeletePlaylist(playlist.id)}
                        disabled={busy}
                        aria-label={`Delete collection ${playlist.name}`}
                        className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-40"
                        title="Delete Collection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Collapsible body */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        id={`playlist-body-${playlist.id}`}
                        key="body"
                        variants={collapseVariants}
                        initial="closed"
                        animate="open"
                        exit="closed"
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="px-5 pb-5 space-y-5 border-t border-white/[0.05]">
                          {/* Current items grid */}
                          <div className="grid grid-cols-4 gap-2 pt-4">
                            {playlist.items.map(item => (
                              <div
                                key={item.id}
                                className="relative aspect-square rounded-xl overflow-hidden border border-white/5 group/asset shadow-sm"
                              >
                                {item.asset.kind === 'VIDEO' ? (
                                  <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center overflow-hidden">
                                    {item.asset.thumbnailUrl ? (
                                      <>
                                        <Image
                                          src={item.asset.thumbnailUrl}
                                          alt="Video thumbnail"
                                          fill
                                          sizes="100px"
                                          className="object-cover transition-opacity duration-300 group-hover/asset:opacity-0"
                                        />
                                        <video
                                          src={item.asset.originalUrl}
                                          muted
                                          preload="none"
                                          loop
                                          playsInline
                                          className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover/asset:opacity-100 transition-opacity duration-300"
                                          onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.pause();
                                            e.currentTarget.currentTime = 0;
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <FileVideo className="w-4 h-4 text-violet-500/40" />
                                    )}
                                  </div>
                                ) : (
                                  <Image
                                    src={item.asset.thumbnailUrl || item.asset.resizedUrl || item.asset.originalUrl}
                                    alt="Art item"
                                    fill
                                    sizes="100px"
                                    className="object-cover transition-transform group-hover/asset:scale-110"
                                  />
                                )}
                                <button
                                  onClick={() => handleRemoveAsset(item.id)}
                                  disabled={busy}
                                  aria-label={`Remove ${item.asset.kind.toLowerCase()} from ${playlist.name}`}
                                  className="absolute right-0 top-0 rounded-bl-lg bg-red-950/80 p-2 flex items-center justify-center text-white transition-all duration-300 hover:bg-red-600 disabled:opacity-40"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {playlist.items.length === 0 && (
                              <div className="col-span-4 py-6 text-center rounded-xl border border-dashed border-white/[0.07] bg-black/10">
                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                                  Add assets below
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Picker section */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-0.5">
                              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                                Add to Collection
                              </span>
                              {availableCount > 0 && (
                                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                                  {availableCount} available
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide">
                              {assets
                                .filter((a) => !playlist.items.some(i => i.assetId === a.id))
                                .map((asset) => (
                                  <button
                                    key={asset.id}
                                    onClick={() => handleAddAsset(playlist.id, asset.id)}
                                    disabled={busy}
                                    aria-label={`Add ${asset.kind.toLowerCase()} to ${playlist.name}`}
                                    className="relative w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-black/20 group/add transition-all"
                                    style={{
                                      border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,211,238,0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
                                    }}
                                  >
                                    {asset.kind === 'VIDEO' ? (
                                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 overflow-hidden">
                                        {asset.thumbnailUrl ? (
                                          <>
                                            <Image
                                              src={asset.thumbnailUrl}
                                              alt="Video thumbnail"
                                              fill
                                              sizes="48px"
                                              className="object-cover transition-opacity duration-300 group-hover/add:opacity-0"
                                            />
                                            <video
                                              src={asset.originalUrl}
                                              muted
                                              preload="none"
                                              loop
                                              playsInline
                                              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover/add:opacity-100 transition-opacity duration-300"
                                              onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.pause();
                                                e.currentTarget.currentTime = 0;
                                              }}
                                            />
                                          </>
                                        ) : (
                                          <FileVideo className="w-4 h-4 text-zinc-700" />
                                        )}
                                      </div>
                                    ) : (
                                      <Image
                                        src={asset.thumbnailUrl || asset.resizedUrl || asset.originalUrl}
                                        alt="Art item"
                                        fill
                                        sizes="48px"
                                        className="object-cover opacity-40 group-hover/add:opacity-100 transition-all group-hover/add:scale-110"
                                      />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/add:opacity-100 transition-all"
                                      style={{ background: 'rgba(34,211,238,0.25)' }}
                                    >
                                      <Plus className="w-4 h-4 text-white" />
                                    </div>
                                  </button>
                                ))}
                              {availableCount === 0 && (
                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest py-2 px-1">
                                  Fully Curated
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
