'use client';

import Image from 'next/image';
import { getAssets, deleteAsset } from '@/actions/assets';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, FileVideo, ImageIcon, Loader2 } from 'lucide-react';

const PAGE_SIZE = 12;

export default function AssetGallery() {
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof getAssets>>>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(0);

  const fetchData = useCallback(async () => {
    const request = ++requests.current;
    try {
      const data = await getAssets();
      if (request === requests.current) setAssets(data);
    } catch {
      setError('Could not load the gallery. Check the server and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial synchronization with the server; state updates follow the awaited request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, 30000);
    window.addEventListener("assets-updated", fetchData);
    return () => {
      clearInterval(interval);
      window.removeEventListener("assets-updated", fetchData);
    };
  }, [fetchData]);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, assets.length));
  }, [assets.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading, visibleCount]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    setDeleting(id);
    setError(null);
    try {
      const result = await deleteAsset(id);
      if (!result.success) throw new Error(result.error || 'Could not delete asset');
      setAssets(previous => previous.filter(a => a.id !== id));
      window.dispatchEvent(new Event('assets-updated'));
      window.dispatchEvent(new Event('playlists-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete asset. Try again.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading && assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-zinc-500 font-medium animate-pulse">Scanning gallery...</p>
      </div>
    );
  }

  const errorNotice = error && <div role="alert" className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-300">{error}<button className="ml-2 underline" onClick={() => { setError(null); void fetchData(); }}>Retry</button></div>;

  if (assets.length === 0) {
    return (
      <>
      {errorNotice}
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-[2.5rem] border-2 border-dashed border-white/5 bg-white/[0.02] text-center p-12">
        <div className="p-4 rounded-3xl bg-white/5 mb-4">
          <ImageIcon className="w-12 h-12 text-zinc-600" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No Art Found</h3>
        <p className="text-zinc-500 max-w-xs mx-auto font-medium">
          Your gallery is currently empty. Start by uploading some art to your collection.
        </p>
      </div>
      </>
    );
  }

  const visibleAssets = assets.slice(0, visibleCount);
  const hasMore = visibleCount < assets.length;

  return (
    <>
      {errorNotice}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-5 animate-in fade-in duration-700">
        {visibleAssets.map((asset) => (
          <div key={asset.id} className="relative group aspect-[4/5] sm:aspect-square overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-xl transition-all duration-500 hover:border-blue-500/30 hover:shadow-blue-500/10">
            {asset.kind === 'VIDEO' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 overflow-hidden">
                {asset.thumbnailUrl ? (
                  <>
                    <Image
                      src={asset.thumbnailUrl}
                      alt="Video thumbnail"
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover transition-opacity duration-300 group-hover:opacity-0"
                      loading="lazy"
                    />
                    <video
                      src={asset.originalUrl}
                      muted
                      preload="none"
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      onMouseEnter={(e) => { void e.currentTarget.play().catch(() => {}); }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  </>
                ) : (
                  <>
                    <FileVideo className="w-12 h-12 text-blue-500/50" />
                    <span className="mt-2 text-[10px] font-black text-blue-500/40 uppercase tracking-widest">Video Content</span>
                  </>
                )}
              </div>
            ) : (
              <Image
                src={asset.thumbnailUrl || asset.resizedUrl || asset.originalUrl}
                alt="Art asset"
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                loading="lazy"
              />
            )}

            {/* Glass Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 transition-all duration-300 flex flex-col justify-between p-3 sm:p-4">
              <div className="flex justify-between items-start">
                <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10">
                  {asset.kind === 'VIDEO' ? (
                    <FileVideo className="w-4 h-4 text-blue-400" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-white" />
                  )}
                </div>

                <button
                  onClick={() => handleDelete(asset.id)}
                  disabled={deleting !== null}
                  aria-label={`Delete ${asset.kind.toLowerCase()} asset`}
                  className="p-2 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300 active:scale-90"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 border border-blue-400/20 text-[10px] font-black text-blue-300 uppercase tracking-widest">
                    {asset.kind}
                  </span>
                  <span className="text-white text-[10px] font-bold opacity-70">
                    {(asset.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </div>
            </div>

            {deleting === asset.id && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sentinel / load-more indicator */}
      <div ref={sentinelRef} className="mt-6 flex justify-center">
        {hasMore && (
          <button onClick={loadMore} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">Load more art</button>
        )}
      </div>
    </>
  );
}
