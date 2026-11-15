'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getDisplayPlaylistIds } from '@/lib/display-playlists';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function createPlaylist(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return { success: false, error: 'Collection name must be 1–80 characters' };
  try {
    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        userId: DEFAULT_USER_ID,
      },
    });
    refreshDashboard();
    return { success: true, playlist };
  } catch (error) {
    console.error('Error creating playlist:', error);
    return { success: false, error: 'Failed to create playlist' };
  }
}

export async function getPlaylists() {
  return prisma.playlist.findMany({
    where: { userId: DEFAULT_USER_ID },
    include: {
      items: {
        include: {
          asset: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
      displays: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addAssetToPlaylist(playlistId: string, assetId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.playlist.findUniqueOrThrow({ where: { id: playlistId, userId: DEFAULT_USER_ID } });
      await tx.asset.findUniqueOrThrow({ where: { id: assetId, userId: DEFAULT_USER_ID } });
      const existing = await tx.playlistItem.findFirst({ where: { playlistId, assetId } });
      if (existing) return;
      // Get current max sort order
      const lastItem = await tx.playlistItem.findFirst({
        where: { playlistId },
        orderBy: { sortOrder: 'desc' },
      });

      const nextSortOrder = (lastItem?.sortOrder ?? -1) + 1;

      await tx.playlistItem.create({
        data: {
          playlistId,
          assetId,
          sortOrder: nextSortOrder,
        },
      });
    });

    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error adding asset to playlist:', error);
    return { success: false, error: 'Failed to add asset' };
  }
}

export async function removeAssetFromPlaylist(playlistItemId: string) {
  try {
    await prisma.playlistItem.delete({
      where: { id: playlistItemId, playlist: { userId: DEFAULT_USER_ID } },
    });
    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error removing asset from playlist:', error);
    return { success: false, error: 'Failed to remove asset' };
  }
}

export async function deletePlaylist(playlistId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.playlist.findUniqueOrThrow({ where: { id: playlistId, userId: DEFAULT_USER_ID } });
      // Delete playlist items first (cascade or explicit)
      await tx.playlistItem.deleteMany({
        where: { playlistId },
      });

      // Removing one group must preserve the display's other checked groups.
      for (const display of await tx.display.findMany({ where: { userId: DEFAULT_USER_ID } })) {
        const selected = getDisplayPlaylistIds(display);
        if (!selected.includes(playlistId)) continue;
        const remaining = selected.filter(id => id !== playlistId);
        const config = display.config && typeof display.config === 'object' && !Array.isArray(display.config) ? display.config : {};
        await tx.display.update({ where: { id: display.id }, data: {
          assignedPlaylistId: remaining[0] ?? null,
          config: { ...config, playlistIds: remaining },
        } });
      }

      // Delete playlist
      await tx.playlist.delete({
        where: { id: playlistId },
      });
    });

    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return { success: false, error: 'Failed to delete playlist' };
  }
}

export async function assignPlaylistToDisplay(displayId: string, playlistId: string | null) {
  return assignPlaylistsToDisplay(displayId, playlistId === null ? [] : [playlistId]);
}

export async function assignPlaylistsToDisplay(displayId: string, playlistIds: unknown, playAll = false) {
  if (typeof playAll !== 'boolean' || !Array.isArray(playlistIds) || playlistIds.length > 1000 || playlistIds.some(id => typeof id !== 'string' || !id.length || id.length > 128)) {
    return { success: false, error: 'Choose valid collections' };
  }
  const selected = [...new Set(playlistIds as string[])];
  try {
    await prisma.$transaction(async (tx) => {
      const display = await tx.display.findUniqueOrThrow({ where: { id: displayId, userId: DEFAULT_USER_ID } });
      const available = await tx.playlist.count({ where: { id: { in: selected }, userId: DEFAULT_USER_ID } });
      if (available !== selected.length) throw new Error('Unknown collection');
      const config = display.config && typeof display.config === 'object' && !Array.isArray(display.config) ? display.config : {};
      await tx.display.update({
        where: { id: displayId, userId: DEFAULT_USER_ID },
        data: {
          assignedPlaylistId: selected[0] ?? null,
          config: { ...config, playlistIds: selected, playAll },
        },
      });
    });
    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error assigning collections to display:', error);
    return { success: false, error: 'Failed to update selected collections' };
  }
}

// A cache refresh failure must not report a committed database mutation as failed.
function refreshDashboard() {
  try {
    revalidatePath('/');
  } catch (error) {
    console.error('Dashboard cache refresh failed:', error);
  }
}
