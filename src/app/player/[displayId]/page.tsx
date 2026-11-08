"use client";

import { Suspense, use, useEffect, useState, useRef, memo, useCallback } from "react";
import Image from "next/image";
import { getDisplayPlaylist, sendHeartbeat } from "@/actions/displays";
import { Loader2, MonitorOff, Maximize, Minimize, ChevronLeft, ChevronRight, RefreshCw, Shuffle } from "lucide-react";
import StarfieldBackground from "@/components/StarfieldBackground";

interface Asset {
  id: string;
  kind: string;
  originalUrl: string;
  resizedUrl: string | null;
  thumbnailUrl: string | null;
}

// Blurred ambient background shared by both image and video slides
function AmbientBackground({ src }: { src: string }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ transform: "scale(1.12)", pointerEvents: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        style={{ filter: "blur(16px) brightness(0.35)" }}
      />
    </div>
  );
}

const VideoSlide = memo(function VideoSlide({ asset, isActive, fitMode, shouldPreload }: {
  asset: Asset; isActive: boolean; fitMode: string; shouldPreload: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;

    if (isActive) {
      // currentTime is already 0 (reset during deactivation) — play directly, no seek
      video.play().catch(() => {});
    } else {
      // Wait for opacity transition to complete before pausing (keeps fade smooth)
      const pauseTimer = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }, 650);
      return () => clearTimeout(pauseTimer);
    }
  }, [isActive]);

  // Background: use thumbnail if available, otherwise skip (black is fine fallback)
  const bgSrc = asset.thumbnailUrl || asset.resizedUrl;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      {/* Blurred thumbnail as ambient background */}
      {bgSrc && <AmbientBackground src={bgSrc} />}

      {/* Main video */}
      <video
        ref={videoRef}
        src={asset.originalUrl}
        muted
        loop
        playsInline
        preload={shouldPreload ? "auto" : "metadata"}
        onCanPlay={(e) => {
          if (isActive) (e.target as HTMLVideoElement).play().catch(() => {});
        }}
        style={{
          pointerEvents: "none",
          willChange: isActive ? "transform" : "auto",
          transform: "translateZ(0)",
        }}
        className={`absolute inset-0 w-full h-full ${fitMode === "cover" ? "object-cover" : "object-contain"}`}
      />
    </div>
  );
}, (prev, next) =>
  prev.isActive === next.isActive &&
  prev.shouldPreload === next.shouldPreload &&
  prev.fitMode === next.fitMode &&
  prev.asset.id === next.asset.id
);

const ImageSlide = memo(function ImageSlide({ asset, isActive, fitMode }: {
  asset: Asset; isActive: boolean; fitMode: string;
}) {
  const src = asset.resizedUrl || asset.originalUrl;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      {/* Blurred ambient background fills letterbox/pillarbox areas */}
      <AmbientBackground src={src} />

      {/* Main image */}
      <Image
        src={src}
        alt="Art"
        fill
        priority={isActive}
        sizes="100vw"
        className={fitMode === "cover" ? "object-cover" : "object-contain"}
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}, (prev, next) =>
  prev.isActive === next.isActive &&
  prev.fitMode === next.fitMode &&
  prev.asset.id === next.asset.id
);

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PlayerContent({ displayId }: { displayId: string }) {
  const rawPlaylistRef = useRef<Asset[]>([]);
  const [shuffle, setShuffle] = useState(true);
  const shuffleRef = useRef(true);
  const [playlist, setPlaylist] = useState<Asset[]>([]);
  const [config, setConfig] = useState({
    rotationInterval: 10,
    fitMode: "contain" as "contain" | "cover",
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerVersion, setTimerVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last-seen asset fingerprint — prevents reshuffle on every poll
  const assetFingerprintRef = useRef<string>("");

  const toggleShuffle = () => {
    const next = !shuffleRef.current;
    shuffleRef.current = next;
    setShuffle(next);
    setPlaylist(next ? shuffleArray(rawPlaylistRef.current) : [...rawPlaylistRef.current]);
    setCurrentIndex(0);
    setTimerVersion((v) => v + 1);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try { await containerRef.current?.requestFullscreen(); } catch {}
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setOverlayVisible(true);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // In fullscreen: hide overlays after 3s of inactivity to prevent burn-in
  useEffect(() => {
    if (!isFullscreen) {
      // Exiting fullscreen — clear timer, restore overlay visibility
      if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
      return;
    }

    const resetTimer = () => {
      setOverlayVisible(true);
      if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
      hideOverlayTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
    };

    hideOverlayTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("pointerdown", resetTimer);
    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("pointerdown", resetTimer);
      if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
    };
  }, [isFullscreen]);

  // Fetch playlist + heartbeat
  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    const fetchPlaylist = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const data = await getDisplayPlaylist(displayId);
        if (cancelled) return;
        if (data) {
          // Stable fingerprint: only reshuffle + reset index when asset list changes.
          // Config updates (interval, fitMode) flow through independently.
          const fingerprint = data.assets.map((a) => a.id).join(",");
          if (fingerprint !== assetFingerprintRef.current) {
            assetFingerprintRef.current = fingerprint;
            rawPlaylistRef.current = data.assets;
            setPlaylist(shuffleRef.current ? shuffleArray(data.assets) : [...data.assets]);
            setCurrentIndex(0);
            setTimerVersion((v) => v + 1);
          }
          setConfig(data.config);
          setError(null);
        } else {
          assetFingerprintRef.current = "";
          rawPlaylistRef.current = [];
          setPlaylist([]);
          setError("No display found");
        }
      } catch {
        if (!cancelled && !assetFingerprintRef.current) setError("Error connecting to server");
      } finally {
        fetching = false;
        if (!cancelled) setLoading(false);
      }
    };

    const heartbeat = async () => {
      try {
        let batteryLevel: number | undefined;
        let networkType: string | undefined;
        if (typeof navigator !== "undefined") {
          const device = navigator as Navigator & {
            getBattery?: () => Promise<{ level: number }>;
            connection?: { effectiveType?: string; type?: string };
          };
          if (device.getBattery) {
            try {
              const battery = await device.getBattery();
              batteryLevel = Math.round(battery.level * 100);
            } catch {}
          }
          networkType = device.connection
            ? (device.connection.effectiveType || device.connection.type)
            : navigator.onLine ? "online" : "offline";
        }
        await sendHeartbeat(displayId, batteryLevel, networkType);
      } catch {}
    };

    fetchPlaylist();
    heartbeat();
    const pi = setInterval(fetchPlaylist, 30000);
    const hi = setInterval(heartbeat, 30000);
    return () => { cancelled = true; clearInterval(pi); clearInterval(hi); };
  }, [displayId]);

  // Auto-rotation — timerVersion bump resets countdown after manual nav
  useEffect(() => {
    if (playlist.length <= 1) return;
    const ms = Math.max(1000, (Number(config.rotationInterval) || 10) * 1000);
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }, ms);
    return () => clearInterval(id);
  }, [playlist.length, config.rotationInterval, timerVersion]);

  // navigate — stabilized with useCallback to avoid keyboard effect churn
  const navigate = useCallback((dir: number) => {
    if (playlist.length <= 1) return;
    setCurrentIndex((prev) => ((prev + dir) + playlist.length) % playlist.length);
    setTimerVersion((v) => v + 1);
  }, [playlist.length]);

  // Keyboard navigation
  useEffect(() => {
    if (playlist.length <= 1) return;
    const len = playlist.length;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev + 1) % len);
        setTimerVersion((v) => v + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => ((prev - 1) + len) % len);
        setTimerVersion((v) => v + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playlist.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center space-y-6">
        <StarfieldBackground />
        <div className="relative z-10 flex flex-col items-center gap-5">
          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
          <div className="text-zinc-600 font-black text-[10px] tracking-[0.3em] uppercase">
            Initializing…
          </div>
        </div>
      </div>
    );
  }

  if (error || playlist.length === 0) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Planetarium starfield — same as main dashboard */}
        <StarfieldBackground />

        {/* Offline card — liquid glass on top of stars */}
        <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
          {/* Icon pill */}
          <div
            className="w-20 h-20 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 48px rgba(0,0,0,0.5)',
            }}
          >
            <MonitorOff className="w-8 h-8 text-zinc-500" />
          </div>

          <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic mb-3">
            Station Offline
          </h1>
          <p className="text-zinc-500 font-medium text-xs leading-relaxed mb-10 max-w-[260px]">
            {error || "Assign a collection in the dashboard to begin broadcasting."}
          </p>

          {/* Display ID pill */}
          <div
            className="px-4 py-2 rounded-2xl flex items-center gap-3"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
            </span>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
              ID: {displayId.slice(0, 8)}…
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Controls visibility of overlays: hover-driven normally, inactivity-driven in fullscreen
  const overlayClass = isFullscreen
    ? overlayVisible ? "opacity-100" : "opacity-0 pointer-events-none"
    : "opacity-0 group-hover/player:opacity-100";

  return (
    <div
      ref={containerRef}
      className={`min-h-screen bg-black overflow-hidden relative select-none group/player ${isFullscreen && !overlayVisible ? "cursor-none" : "cursor-auto"}`}
    >
      {playlist.map((asset, index) => {
        const len = playlist.length;
        const isActive = index === currentIndex;
        const isPrev = index === (currentIndex - 1 + len) % len;
        const isNext = index === (currentIndex + 1) % len;
        const isAdjacent = isPrev || isNext;
        const shouldRenderContent = isActive || isAdjacent;
        const shouldPreload = isActive || isAdjacent;

        return (
          <div
            key={`slide-${index}`}
            className="absolute inset-0"
            style={{
              opacity: isActive ? 1 : 0,
              zIndex: isActive ? 10 : 0,
              transition: "opacity 600ms ease-in-out",
              pointerEvents: isActive ? "auto" : "none",
              willChange: isActive ? "opacity" : "auto",
            }}
          >
            {shouldRenderContent ? (
              asset.kind === "VIDEO" ? (
                <VideoSlide asset={asset} isActive={isActive} fitMode={config.fitMode} shouldPreload={shouldPreload} />
              ) : (
                <ImageSlide asset={asset} isActive={isActive} fitMode={config.fitMode} />
              )
            ) : (
              <div className="absolute inset-0 bg-black" />
            )}
          </div>
        );
      })}

      {/* Left edge navigation */}
      {playlist.length > 1 && (
        <button
          onClick={() => navigate(-1)}
          className={`absolute left-0 top-0 h-full w-20 z-30 flex items-center justify-start group/left focus:outline-none transition-opacity duration-500 ${overlayClass}`}
          aria-label="Previous"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
          <ChevronLeft className="relative z-10 w-8 h-8 text-white opacity-0 group-hover/left:opacity-80 transition-opacity duration-200 ml-2 drop-shadow-lg" />
        </button>
      )}

      {/* Right edge navigation */}
      {playlist.length > 1 && (
        <button
          onClick={() => navigate(1)}
          className={`absolute right-0 top-0 h-full w-20 z-30 flex items-center justify-end group/right focus:outline-none transition-opacity duration-500 ${overlayClass}`}
          aria-label="Next"
        >
          <div className="absolute inset-0 bg-gradient-to-l from-black/40 to-transparent" />
          <ChevronRight className="relative z-10 w-8 h-8 text-white opacity-0 group-hover/right:opacity-80 transition-opacity duration-200 mr-2 drop-shadow-lg" />
        </button>
      )}

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className={`absolute top-4 right-4 p-3 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-white/50 hover:text-white backdrop-blur-md transition-all duration-500 z-50 shadow-2xl ${overlayClass}`}
      >
        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
      </button>

      {/* Shuffle toggle */}
      <button
        onClick={toggleShuffle}
        aria-label="Shuffle playback"
        aria-pressed={shuffle}
        title={shuffle ? "Shuffle ON — click to disable" : "Shuffle OFF — click to enable"}
        className={`absolute top-4 right-16 p-3 rounded-xl border backdrop-blur-md transition-all duration-500 z-50 shadow-2xl ${overlayClass} ${
          shuffle
            ? "bg-blue-500/30 border-blue-400/40 text-blue-300 hover:bg-blue-500/50"
            : "bg-black/40 border-white/10 text-white/30 hover:bg-black/60 hover:text-white/60"
        }`}
      >
        <Shuffle className="w-5 h-5" />
      </button>

      {/* Loop indicator — top-left */}
      <div className={`absolute top-4 left-4 flex items-center gap-2 transition-opacity duration-500 pointer-events-none z-40 ${overlayClass}`}>
        <RefreshCw className="w-3 h-3 text-zinc-500 animate-spin" style={{ animationDuration: "3s" }} />
        <div className="flex flex-col items-start">
          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Looping</span>
          <span className="text-[10px] font-bold text-blue-500 tracking-tighter">LOOP</span>
        </div>
      </div>

      {/* Telemetry — bottom-right */}
      <div className={`absolute bottom-8 right-8 flex items-center gap-3 transition-opacity duration-500 pointer-events-none z-40 ${overlayClass}`}>
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Broadcasting</span>
          <span className="text-[10px] font-bold text-blue-500 tracking-tighter">LIQUID SYNC</span>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
      </div>
    </div>
  );
}

export default function PlayerPage({
  params,
}: {
  params: Promise<{ displayId: string }>;
}) {
  const unwrappedParams = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center space-y-6">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <div className="text-zinc-500 font-black text-xs animate-pulse tracking-[0.3em] uppercase">
            Initializing Liquid Core...
          </div>
        </div>
      }
    >
      <PlayerContent displayId={unwrappedParams.displayId} />
    </Suspense>
  );
}
