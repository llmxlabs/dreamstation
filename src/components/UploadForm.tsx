'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadAsset } from '@/actions/assets';
import { getPlaylists, addAssetToPlaylist } from '@/actions/playlists';
import { Upload, FileVideo, ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import GlassPanel from '@/components/GlassPanel';

type Playlist = { id: string; name: string };

const LS_AUTOADD_ENABLED = 'ds_autoadd_enabled';
const LS_AUTOADD_PLAYLIST = 'ds_autoadd_playlist';

export default function UploadForm() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fileCount, setFileCount] = useState<number>(0);
  const [fileType, setFileType] = useState<'image' | 'video' | 'mixed' | null>(null);

  // Auto-add to collection state
  const [autoAddEnabled, setAutoAddEnabled] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore localStorage prefs on mount
  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem(LS_AUTOADD_ENABLED);
      // Browser-only preferences are restored after hydration, never during the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedEnabled === 'true') setAutoAddEnabled(true);
      const savedPlaylist = localStorage.getItem(LS_AUTOADD_PLAYLIST);
      if (savedPlaylist) setSelectedPlaylistId(savedPlaylist);
    } catch { /* Preferences are optional in private or restricted browsers. */ }
  }, []);

  // Fetch playlists when toggle turns on
  useEffect(() => {
    if (!autoAddEnabled) return;
    let active = true;
    const refresh = async () => {
      setLoadingPlaylists(true);
      try {
        const data = await getPlaylists();
        if (!active) return;
        setPlaylists(data.map(p => ({ id: p.id, name: p.name })));
        setSelectedPlaylistId(previous => data.some(p => p.id === previous) ? previous : '');
      } catch {
        if (active) setError('Could not load collections. Turn auto-add off and on to retry.');
      } finally {
        if (active) setLoadingPlaylists(false);
      }
    };
    void refresh();
    window.addEventListener('playlists-updated', refresh);
    return () => { active = false; window.removeEventListener('playlists-updated', refresh); };
  }, [autoAddEnabled]);

  const handleToggle = () => {
    const next = !autoAddEnabled;
    setAutoAddEnabled(next);
    try { localStorage.setItem(LS_AUTOADD_ENABLED, String(next)); } catch { /* Optional preference. */ }
  };

  const handlePlaylistChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPlaylistId(e.target.value);
    try { localStorage.setItem(LS_AUTOADD_PLAYLIST, e.target.value); } catch { /* Optional preference. */ }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setError(null);
    setSuccess(false);
    if (files && files.length > 0) {
      const selected = Array.from(files);
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
      if (selected.length > 20 || selected.some(file => !supported.includes(file.type) || file.size > 50 * 1024 * 1024 || file.size === 0) || selected.reduce((size, file) => size + file.size, 0) > 100 * 1024 * 1024) {
        setError('Choose up to 20 JPEG, PNG, WebP, MP4 or WebM files: 50 MB per file and 100 MB total. Empty files are not supported.');
        e.target.value = '';
        setFileCount(0);
        setFileType(null);
        return;
      }
      setFileCount(files.length);
      let hasImage = false;
      let hasVideo = false;
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('video/')) hasVideo = true;
        else hasImage = true;
      }
      if (hasImage && hasVideo) setFileType('mixed');
      else if (hasVideo) setFileType('video');
      else setFileType('image');
    } else {
      setFileCount(0);
      setFileType(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (uploading) return;
    if (autoAddEnabled && !selectedPlaylistId) {
      setError('Choose a collection or turn off auto-add before uploading.');
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    try {
    const result = await uploadAsset(formData);

    if (result.success && result.assets) {
      // Clear the picker as soon as upload succeeds so an auto-add failure cannot duplicate uploads.
      if (fileRef.current) fileRef.current.value = '';
      setFileCount(0);
      setFileType(null);
      window.dispatchEvent(new Event('assets-updated'));
      // Auto-add to playlist if configured
      if (autoAddEnabled && selectedPlaylistId) {
        const additions = await Promise.allSettled(
          result.assets.map((asset) => addAssetToPlaylist(selectedPlaylistId, asset.id))
        );
        window.dispatchEvent(new CustomEvent('playlists-updated'));
        if (additions.some(result => result.status === 'rejected' || !result.value.success)) {
          setError('Your files are in the gallery, but some could not be added to the collection. Add them using Curation.');
          return;
        }
      }

      setSuccess(true);
    } else {
      setError((result as { success: false; error?: string }).error || 'Upload failed');
    }

    } catch {
      setError('The upload could not finish. Check your connection and server, then try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <GlassPanel variant="hero" delay={0.05}>
      {/* Prism accent orb */}
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl group-hover:bg-violet-500/15 transition-colors duration-700 pointer-events-none" />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/20">
            <Upload className="w-5 h-5 text-cyan-400" />
          </div>
          <h2 className="text-sm font-black text-white tracking-tight uppercase">Upload New Art</h2>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          {/* File picker */}
          <div className="relative">
            <label htmlFor="upload-files" className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 px-1">
              Select Images or Videos
            </label>
            <div className="relative flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer bg-black/20 hover:bg-black/30 hover:border-cyan-500/40 transition-all duration-300 group/label">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                  {fileType === 'video' ? (
                    <FileVideo className="w-8 h-8 text-cyan-400 mb-3 group-hover/label:scale-110 transition-transform duration-300" />
                  ) : fileType === 'image' ? (
                    <ImageIcon className="w-8 h-8 text-cyan-400 mb-3 group-hover/label:scale-110 transition-transform duration-300" />
                  ) : fileType === 'mixed' ? (
                    <Upload className="w-8 h-8 text-violet-400 mb-3 group-hover/label:scale-110 transition-transform duration-300" />
                  ) : (
                    <Upload className="w-8 h-8 text-zinc-500 mb-3 group-hover/label:text-cyan-400 group-hover/label:scale-110 transition-all duration-300" />
                  )}
                  <span className="block text-xs font-bold text-zinc-200 text-center mb-0.5">Click to upload</span>
                  <span className="block text-xs text-zinc-400 text-center mb-2">Choose files from your device</span>
                  <span className="block text-[10px] text-zinc-400 font-medium tracking-wide text-center">50 MB per file · 100 MB per batch · 20 files</span>
                  {fileCount > 0 && (
                    <div className="mt-3 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-xs font-bold text-cyan-300 animate-in fade-in zoom-in duration-300">
                      {fileCount} {fileCount === 1 ? 'file' : 'files'} selected
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  id="upload-files"
                  aria-label="Choose images or videos to upload"
                  disabled={uploading}
                  type="file"
                  name="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={handleFileChange}
                  required
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:opacity-100 focus:bg-zinc-900 focus:p-3 disabled:cursor-wait"
                />
              </label>
            </div>
          </div>

          {/* Auto-add to collection section */}
          <div className="space-y-3">
            {/* Toggle row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoAddEnabled}
                aria-label="Auto-add uploads to a collection"
                disabled={uploading}
                onClick={handleToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer transition-colors duration-200 ${
                  autoAddEnabled
                    ? 'bg-cyan-500/60 border border-cyan-400/40'
                    : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    autoAddEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-zinc-400 select-none">
                Auto-add to collection
              </span>
            </div>

            {/* Animated dropdown */}
            <AnimatePresence initial={false}>
              {autoAddEnabled && (
                <motion.div
                  key="playlist-dropdown"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <select
                    aria-label="Collection for new uploads"
                    value={selectedPlaylistId}
                    onChange={handlePlaylistChange}
                    disabled={loadingPlaylists || uploading}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300 focus:outline-none focus:border-cyan-400/40 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <option value="" disabled>
                      {loadingPlaylists ? 'Loading...' : 'Select collection...'}
                    </option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error state */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success state */}
          <AnimatePresence>
            {success && (
              <motion.div
                key="success"
                role="status"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-sm"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <p className="font-medium">Uploaded successfully!</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <button
            type="submit"
            disabled={uploading || fileCount === 0}
            className="group/btn relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 py-3 px-4 text-xs font-black text-white tracking-widest uppercase shadow-lg transition-all hover:from-cyan-500 hover:to-violet-500 hover:shadow-cyan-500/25 active:scale-[0.98] disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 disabled:active:scale-100"
          >
            <div className="relative z-10 flex items-center justify-center gap-2">
              {uploading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  <span>PREPARING...</span>
                </>
              ) : (
                <span>DEPLOY TO GALLERY</span>
              )}
            </div>
            {/* Shimmer */}
            {!uploading && (
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
            )}
          </button>
        </form>
      </div>
    </GlassPanel>
  );
}
