'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import UploadForm from '@/components/UploadForm';
import AssetGallery from '@/components/AssetGallery';
import DisplayManager from '@/components/DisplayManager';
import PlaylistManager from '@/components/PlaylistManager';
import StarfieldBackground from '@/components/StarfieldBackground';
import LiquidGlassPanel from '@/components/LiquidGlassPanel';
import { Database, HardDrive, ShieldCheck } from 'lucide-react';

function SystemStatus() {
  return (
    <LiquidGlassPanel ambient="cyan" animate={false} className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <ShieldCheck className="w-4 h-4 text-green-400" />
        </div>
        <h2 className="text-sm font-black text-white tracking-tight">Your Installation</h2>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] group hover:bg-white/[0.07] transition-colors">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Database</span>
          </div>
          <span className="text-[9px] font-black text-green-400 bg-green-400/10 px-2 py-1 rounded-lg border border-green-400/20 uppercase tracking-widest">
            SQLite
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] group hover:bg-white/[0.07] transition-colors">
          <div className="flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Storage</span>
          </div>
          <span className="text-[9px] font-black text-violet-400 bg-violet-400/10 px-2 py-1 rounded-lg border border-violet-400/20 uppercase tracking-widest">
            Local FS
          </span>
        </div>
      </div>
    </LiquidGlassPanel>
  );
}

export default function DashboardShell() {
  const reduced = useReducedMotion();

  const ease = [0.25, 0.1, 0.25, 1] as const;

  const navVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : -8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };

  const leftVariants = {
    hidden: { opacity: 0, x: reduced ? 0 : -16 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, delay: 0.1, ease } },
  };

  const centerVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.15, ease } },
  };

  const rightVariants = {
    hidden: { opacity: 0, x: reduced ? 0 : 16 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, delay: 0.2, ease } },
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <StarfieldBackground />

      {/* Sticky navbar */}
      <motion.header
        variants={navVariants}
        initial="hidden"
        animate="visible"
        className="sticky top-0 z-50 backdrop-blur-md bg-white/[0.03] border-b border-white/[0.06]"
      >
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/dreamstation-logo.png"
              width={1411}
              height={424}
              priority
              alt="DreamStation"
              className="h-10 sm:h-12 max-w-[190px] sm:max-w-none w-auto object-contain select-none"
              draggable={false}
            />
          </div>

          <div className="shrink-0 flex items-center gap-2 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-2xl">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Local Mode</span>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-8 py-6">
        <h1 className="sr-only">DreamStation Frame — your art, on every screen</h1>
        <div className="grid grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_18rem] gap-6 items-start">

          {/* Left sidebar */}
          <motion.aside
            variants={leftVariants}
            initial="hidden"
            animate="visible"
            className="min-w-0 grid md:grid-cols-2 xl:grid-cols-1 gap-5 items-start"
          >
            <UploadForm />
            <DisplayManager />
            <SystemStatus />
          </motion.aside>

          {/* Center gallery */}
          <motion.main
            variants={centerVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 min-w-0 space-y-6"
          >
            {/* Gallery header — liquid glass pill */}
            <LiquidGlassPanel size="sm" animate={false} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black tracking-tighter text-white uppercase italic">
                  Your Gallery
                </h2>
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  All Assets
                </span>
              </div>
            </LiquidGlassPanel>

            <div className="min-h-[600px]">
              <AssetGallery />
            </div>
          </motion.main>

          {/* Right sidebar */}
          <motion.aside
            variants={rightVariants}
            initial="hidden"
            animate="visible"
            className="min-w-0"
          >
            <PlaylistManager />
          </motion.aside>

        </div>
      </div>
    </div>
  );
}
