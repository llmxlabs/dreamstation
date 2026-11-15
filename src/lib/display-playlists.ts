type DisplaySelection = { assignedPlaylistId: string | null; config: unknown };

export function playsAllArtwork(display: Pick<DisplaySelection, 'config'>): boolean {
  return !!display.config && typeof display.config === 'object' &&
    !Array.isArray(display.config) && (display.config as Record<string, unknown>).playAll === true;
}

export function getDisplayPlaylistIds(display: DisplaySelection): string[] {
  const config = display.config && typeof display.config === 'object' && !Array.isArray(display.config)
    ? display.config as Record<string, unknown> : {};
  if (Array.isArray(config.playlistIds)) {
    return [...new Set(config.playlistIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  }
  return display.assignedPlaylistId ? [display.assignedPlaylistId] : [];
}
