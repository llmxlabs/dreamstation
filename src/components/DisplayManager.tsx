"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import GlassPanel from "@/components/GlassPanel";
import {
  generatePairingCode,
  getDisplays,
  updateDisplayConfig,
  deleteDisplay,
} from "@/actions/displays";
import { getPlaylists, assignPlaylistToDisplay } from "@/actions/playlists";
import QRCode from "qrcode";
import Image from 'next/image';
import {
  Monitor,
  Plus,
  X,
  Settings2,
  PlayCircle,
  RefreshCw,
  Clock,
  Trash2,
  ExternalLink,
} from "lucide-react";

type DisplayConfig = { fitMode: 'contain' | 'cover'; rotationInterval: number };
type Display = Omit<Awaited<ReturnType<typeof getDisplays>>[number], 'config'> & { config: DisplayConfig };

function normalizeConfig(config: unknown): DisplayConfig {
  const value = config && typeof config === 'object' ? config as Partial<DisplayConfig> : {};
  return { fitMode: value.fitMode === 'cover' ? 'cover' : 'contain', rotationInterval: Number(value.rotationInterval) || 10 };
}

export default function DisplayManager() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [playlists, setPlaylists] = useState<Awaited<ReturnType<typeof getPlaylists>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(600);
  const [pairingUrl, setPairingUrl] = useState('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingConfig = useRef<Record<string, Partial<DisplayConfig>>>({});
  const configWrites = useRef<Record<string, Promise<void>>>({});
  const requests = useRef(0);

  const fetchData = useCallback(async () => {
    const request = ++requests.current;
    try {
      const [dData, pData] = await Promise.all([getDisplays(), getPlaylists()]);
      if (request !== requests.current) return;
      setDisplays(dData.map(d => ({ ...d, config: { ...normalizeConfig(d.config), ...pendingConfig.current[d.id] } })));
      setPlaylists(pData);
      setError(previous => previous === 'Could not refresh displays. Check the server and try again.' ? null : previous);
    } catch {
      if (request === requests.current) setError('Could not refresh displays. Check the server and try again.');
    } finally {
      if (request === requests.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll for new displays every 30s
    window.addEventListener('playlists-updated', fetchData);
    window.addEventListener('displays-updated', fetchData);
    const timers = debounceTimers.current;
    return () => {
      clearInterval(interval);
      Object.values(timers).forEach(clearTimeout);
      window.removeEventListener('playlists-updated', fetchData);
      window.removeEventListener('displays-updated', fetchData);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) {
        setPairingCode(null);
        setQrCodeUrl(null);
        setExpiresAt(null);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generatePairingCode();
      if (!result.success || !result.code) throw new Error(result.error || 'Could not generate a pairing code');
      const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const url = new URL('/pair', base);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The app URL must use HTTP or HTTPS');
      url.searchParams.set('code', result.code);
      setPairingCode(result.code);
      setPairingUrl(url.toString());
      setExpiresAt(new Date(result.expiresAt).getTime());
      setQrCodeUrl(await QRCode.toDataURL(url.toString()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a pairing code. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAssignPlaylist = async (
    displayId: string,
    playlistId: string,
  ) => {
    setBusy(displayId);
    setError(null);
    try {
      const result = await assignPlaylistToDisplay(displayId, playlistId === 'none' ? null : playlistId);
      if (!result.success) throw new Error(result.error || 'Could not assign collection');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign collection. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleUpdateConfig = useCallback((
    displayId: string,
    patch: Partial<DisplayConfig>,
  ) => {
    // Optimistic local update so the UI reflects the slider immediately
    setDisplays((prev) =>
      prev.map((d) =>
        d.id === displayId ? { ...d, config: { ...d.config, ...patch } } : d
      )
    );
    // Debounce the server write — 600ms after the last drag event
    pendingConfig.current[displayId] = { ...pendingConfig.current[displayId], ...patch };
    clearTimeout(debounceTimers.current[displayId]);
    debounceTimers.current[displayId] = setTimeout(() => {
      const update = pendingConfig.current[displayId];
      // Serialize writes per display: a slow older request must not overwrite a newer slider value.
      configWrites.current[displayId] = (configWrites.current[displayId] || Promise.resolve()).then(async () => {
        try {
          const result = await updateDisplayConfig(displayId, update);
          if (!result.success) throw new Error(result.error || 'Could not save display settings');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save display settings. Try again.');
        } finally {
          if (pendingConfig.current[displayId] === update) delete pendingConfig.current[displayId];
          await fetchData();
        }
      });
    }, 600);
  }, [fetchData]);

  const handleDeleteDisplay = async (displayId: string) => {
    if (!window.confirm("Are you sure you want to remove this display?"))
      return;
    setBusy(displayId);
    setError(null);
    try {
      clearTimeout(debounceTimers.current[displayId]);
      delete pendingConfig.current[displayId];
      await configWrites.current[displayId];
      const result = await deleteDisplay(displayId);
      if (!result.success) throw new Error(result.error || 'Could not remove display');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove display. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassPanel delay={0.1}>
      <div className="relative p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 p-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Monitor className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-xs font-black text-white tracking-tight uppercase leading-tight">
              Active Displays
            </h2>
          </div>

          <button
            onClick={handleGenerateCode}
            disabled={generating || !!pairingCode}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {generating ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : pairingCode ? (
              <Clock className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            <span>{pairingCode ? "Active" : "Pair"}</span>
          </button>
        </div>

        {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">{error}<button className="ml-2 underline" onClick={() => { setError(null); void fetchData(); }}>Retry</button></div>}
        {pairingCode && (
          <div className="mb-8 p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
                Ready to Pair
              </span>
              <button
                onClick={() => {
                  setPairingCode(null);
                  setQrCodeUrl(null);
                  setExpiresAt(null);
                }}
                aria-label="Close pairing code"
                className="text-blue-400/50 hover:text-blue-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-4">
              <div className="text-3xl font-black text-white tracking-[0.15em] drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                {pairingCode}
              </div>

              {qrCodeUrl && (
                <div className="inline-block p-3 rounded-2xl bg-white/5 border border-white/10 shadow-2xl">
                  <Image
                    src={qrCodeUrl}
                    alt="Scan to pair this display"
                    width={96}
                    height={96}
                    unoptimized
                    className="w-24 h-24 brightness-110 contrast-125"
                  />
                </div>
              )}

              <p className="text-[10px] text-blue-300/60 font-medium leading-relaxed max-w-[200px] mx-auto">
                SCAN QR OR ENTER CODE AT{" "}
                <span className="text-white font-bold">/PAIR</span> ON THE
                DISPLAY DEVICE
              </p>
              <p className="text-xs text-blue-200">Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
              <a href={pairingUrl} className="block break-all text-xs text-blue-300 underline">{pairingUrl}</a>
              {/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(pairingUrl) && <p className="text-xs text-amber-200">For another device, open this dashboard using your server’s LAN address before pairing.</p>}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center py-8 space-y-3">
              <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Scanning Network...
              </span>
            </div>
          ) : displays.length === 0 ? (
            <div className="py-8 text-center px-4 rounded-2xl bg-black/20 border border-white/5">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                No Displays Detected
              </p>
            </div>
          ) : (
            displays.map((display) => (
              <div
                key={display.id}
                className="group/item relative p-4 rounded-2xl bg-white/5 border border-white/5 transition-all hover:bg-white/10 hover:border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full ${display.status === "ONLINE" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" : "bg-zinc-600"}`}
                    />
                    <span className="text-sm font-bold text-white break-words min-w-0">
                      {display.name}
                    </span>
                    <span className="sr-only">{display.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter transition-opacity mr-2">
                      ID: {display.id.slice(0, 8)}
                    </span>
                    <a
                      href={`/player/${display.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      title="Open Player in New Tab"
                      aria-label={`Open player for ${display.name} in a new tab`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteDisplay(display.id)}
                      disabled={busy !== null}
                      aria-label={`Remove display ${display.name}`}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove Display"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 px-1">
                      <PlayCircle className="w-3 h-3 text-zinc-500" />
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        Playlist
                      </span>
                    </label>
                    <select
                      aria-label={`Collection for ${display.name}`}
                      disabled={busy !== null}
                      value={display.assignedPlaylistId || "none"}
                      onChange={(e) =>
                        handleAssignPlaylist(display.id, e.target.value)
                      }
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    >
                      <option value="none">None</option>
                      {playlists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 px-1">
                      <Settings2 className="w-3 h-3 text-zinc-500" />
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        Fit Mode
                      </span>
                    </label>
                    <select
                      aria-label={`Fit mode for ${display.name}`}
                      disabled={busy === display.id}
                      value={display.config?.fitMode || "contain"}
                      onChange={(e) =>
                        handleUpdateConfig(
                          display.id,
                          { fitMode: e.target.value as 'contain' | 'cover' },
                        )
                      }
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-2 py-1.5 text-[11px] font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                      Rotation Interval
                    </span>
                    <span className="text-[10px] font-bold text-blue-400">
                      {(() => {
                        const s = display.config?.rotationInterval || 10;
                        if (s < 60) return `${s}s`;
                        const m = Math.floor(s / 60);
                        const r = s % 60;
                        return r === 0 ? `${m}m` : `${m}m ${r}s`;
                      })()}
                    </span>
                  </div>
                  <input
                    aria-label={`Rotation interval in seconds for ${display.name}`}
                    disabled={busy === display.id}
                    type="range"
                    min="5"
                    max="600"
                    step="5"
                    value={display.config?.rotationInterval || 10}
                    onChange={(e) =>
                      handleUpdateConfig(
                        display.id,
                        { rotationInterval: parseInt(e.target.value) },
                      )
                    }
                    className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                  />
                  <div className="flex justify-between mt-1 px-0.5">
                    <span className="text-[8px] text-zinc-600">5s</span>
                    <span className="text-[8px] text-zinc-600">10m</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
