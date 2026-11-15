import prisma from '@/lib/prisma';
import { getDisplayPlaylistIds, playsAllArtwork } from '@/lib/display-playlists';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

// Shared by the stable player API and the legacy server action.
export async function readDisplayPlaylist(displayId: string) {
  const display = await prisma.display.findUnique({ where: { id: displayId, userId: DEFAULT_USER_ID } });
  if (!display) return null;

  const playlistIds = getDisplayPlaylistIds(display);
  const assets = playsAllArtwork(display)
    ? await prisma.asset.findMany({ where: { userId: DEFAULT_USER_ID }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    : await (async () => {
      const playlists = await prisma.playlist.findMany({
        where: { id: { in: playlistIds }, userId: DEFAULT_USER_ID },
        include: { items: { include: { asset: true }, orderBy: { sortOrder: 'asc' } } },
      });
      const byId = new Map(playlists.map(playlist => [playlist.id, playlist]));
      const seen = new Set<string>();
      return playlistIds.flatMap(id => byId.get(id)?.items || []).flatMap(({ asset }) => {
        if (asset.userId !== DEFAULT_USER_ID || seen.has(asset.id)) return [];
        seen.add(asset.id);
        return [asset];
      });
    })();

  const raw = display.config as { rotationInterval?: number; fitMode?: string } | null;
  return {
    assets,
    config: {
      rotationInterval: Math.min(600, Math.max(5, Number(raw?.rotationInterval) || 10)),
      fitMode: raw?.fitMode === 'cover' ? 'cover' as const : 'contain' as const,
    },
  };
}

export async function recordDisplayHeartbeat(displayId: string, battery?: number, network?: string) {
  if (battery !== undefined && (!Number.isInteger(battery) || battery < 0 || battery > 100)) return { success: false };
  if (network !== undefined && (typeof network !== 'string' || network.length > 32)) return { success: false };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.display.update({
        where: { id: displayId, userId: DEFAULT_USER_ID },
        data: { status: 'ONLINE', updatedAt: new Date() },
      });
      await tx.heartbeat.deleteMany({ where: { displayId } });
      await tx.heartbeat.create({ data: { displayId, battery, network } });
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending heartbeat:', error);
    return { success: false };
  }
}
