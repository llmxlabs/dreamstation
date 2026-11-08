'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { pairDisplay } from '@/actions/displays';
import { Monitor, Link2, AlertCircle, Loader2, ChevronRight, Zap } from 'lucide-react';

function PairContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => /^\d{6}$/.test(searchParams.get('code') || '') ? searchParams.get('code')! : '');
  const [name, setName] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }
    if (!name.trim()) {
      setError('Please name this display');
      return;
    }

    setPairing(true);
    setError(null);

    try {
    const result = await pairDisplay(code, name);

    if (result.success) {
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('displayId', result.displayId!); } catch { /* Optional bookmark. */ }
      }
      router.push(`/player/${result.displayId}`);
    } else {
      setError(result.error || 'Pairing failed');
    }
    } catch { setError('Cannot reach DreamStation. Check your connection and try again.'); }
    finally { setPairing(false); }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full" />

      <div className="relative z-10 max-w-md w-full">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6">
            <Zap className="w-3 h-3" />
            <span>Liquid Link</span>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase italic mb-2">
            Pair <span className="text-blue-500">Device</span>
          </h1>
          <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest">Connect to your DreamStation core</p>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-2xl p-8 sm:p-10 shadow-2xl">
          <form onSubmit={handlePair} className="space-y-8">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">
                Display name
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-blue-500 transition-colors">
                  <Monitor className="w-5 h-5" />
                </div>
                <input
                  type="text" aria-label="Display name" maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.G. GALLERY WALL"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all uppercase tracking-wider"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">
                Pairing code
              </label>
              <div className="relative">
                <input
                  type="text" aria-label="Pairing code" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-6 px-4 text-center text-3xl sm:text-5xl font-black text-blue-500 placeholder-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 tracking-[0.4em] transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wide animate-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-4 h-4" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={pairing}
              className="group relative w-full overflow-hidden rounded-2xl bg-blue-600 py-5 px-4 text-sm font-black text-white shadow-xl transition-all hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600 uppercase tracking-[0.2em]"
            >
              <div className="relative z-10 flex items-center justify-center gap-3">
                {pairing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Establishing Link...</span>
                  </>
                ) : (
                  <>
                    <span>Pair display</span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
              {!pairing && (
                <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
              )}
            </button>
          </form>
        </div>

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">
            <Link2 className="w-3 h-3" />
            <span>TRUSTED LOCAL NETWORK</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <div className="text-zinc-500 font-black text-xs animate-pulse tracking-[0.3em] uppercase">
          Initializing Link Core...
        </div>
      </div>
    }>
      <PairContent />
    </Suspense>
  );
}
