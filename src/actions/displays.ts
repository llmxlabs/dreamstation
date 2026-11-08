'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function generatePairingCode() {
  // Generate a random 6-digit code
  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes

  try {
    await prisma.pairingCode.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const pairingCode = await prisma.pairingCode.create({
      data: {
        code,
        userId: DEFAULT_USER_ID,
        expiresAt,
      },
    });

    return { success: true, code: pairingCode.code, expiresAt: pairingCode.expiresAt.toISOString() };
  } catch (error) {
    console.error('Error generating pairing code:', error);
    return { success: false, error: 'Failed to generate code' };
  }
}

export async function pairDisplay(code: string, displayName: string) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 80) {
    return { success: false, error: 'Enter a six-digit code and a display name of 1–80 characters' };
  }
  try {
    const display = await prisma.$transaction(async (tx) => {
      const pairingCode = await tx.pairingCode.findUnique({
        where: { code },
      });

      if (!pairingCode) {
        throw new Error('Invalid pairing code');
      }

      if (new Date() > pairingCode.expiresAt) {
        throw new Error('Pairing code expired');
      }

      // Create the display and link to the user
      const display = await tx.display.create({
        data: {
          name: displayName.trim(),
          userId: pairingCode.userId,
          status: 'OFFLINE',
        },
      });

      // Clean up the pairing code
      await tx.pairingCode.delete({ where: { id: pairingCode.id } });
      return display;
    });

    refreshDashboard();
    return { success: true, displayId: display.id };
  } catch (error) {
    console.error('Error pairing display:', error);
    return { success: false, error: error instanceof Error && ['Invalid pairing code', 'Pairing code expired'].includes(error.message) ? error.message : 'Pairing failed' };
  }
}

export async function deleteDisplay(displayId: string) {
  try {
    // Delete heartbeats first (foreign key constraint)
    await prisma.$transaction(async (tx) => {
      await tx.heartbeat.deleteMany({
        where: { displayId },
      });

      // Delete the display
      await tx.display.delete({
        where: { id: displayId, userId: DEFAULT_USER_ID },
      });
    });

    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error deleting display:', error);
    return { success: false, error: 'Failed to delete display' };
  }
}

export async function getDisplays() {
  const displays = await prisma.display.findMany({
    where: { userId: DEFAULT_USER_ID },
    orderBy: { createdAt: 'desc' },
    include: { heartbeats: { orderBy: { seenAt: 'desc' }, take: 1 } },
  });
  return displays.map(({ heartbeats, ...display }) => ({
    ...display,
    status: heartbeats[0] && Date.now() - heartbeats[0].seenAt.getTime() < 90000 ? 'ONLINE' : 'OFFLINE',
  }));
}

export async function updateDisplayConfig(displayId: string, config: unknown) {
  if (!config || typeof config !== 'object') return { success: false, error: 'Invalid configuration' };
  const input = config as Record<string, unknown>;
  const interval = input.rotationInterval;
  const fitMode = input.fitMode;
  if (Object.keys(input).some((key) => key !== 'rotationInterval' && key !== 'fitMode') || (interval !== undefined && (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 5 || interval > 600)) || (fitMode !== undefined && fitMode !== 'contain' && fitMode !== 'cover')) {
    return { success: false, error: 'Use a 5–600 second interval and contain or cover fit mode' };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const display = await tx.display.findUniqueOrThrow({ where: { id: displayId, userId: DEFAULT_USER_ID } });
      const current = display.config as { rotationInterval?: number; fitMode?: string } | null;
      await tx.display.update({
        where: { id: displayId, userId: DEFAULT_USER_ID },
        data: {
          config: { rotationInterval: interval ?? current?.rotationInterval ?? 10, fitMode: fitMode ?? current?.fitMode ?? 'contain' },
        },
      });
    });
    refreshDashboard();
    return { success: true };
  } catch (error) {
    console.error('Error updating display config:', error);
    return { success: false, error: 'Failed to update configuration' };
  }
}

export async function getDisplayPlaylist(displayId: string) {
  try {
    const display = await prisma.display.findUnique({
      where: { id: displayId },
      include: {
        assignedPlaylist: {
          include: {
            items: {
              include: {
                asset: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
        },
      },
    });

    if (!display) {
      return null;
    }

    const assets = display.assignedPlaylist?.items.map((item) => item.asset) || [];

    const raw = display.config as { rotationInterval?: number; fitMode?: string } | null;
    return {
      assets,
      config: {
        rotationInterval: Math.min(600, Math.max(5, Number(raw?.rotationInterval) || 10)),
        fitMode: raw?.fitMode === 'cover' ? 'cover' as const : 'contain' as const,
      },
    };
  } catch (error) {
    console.error('Error fetching display playlist:', error);
    throw new Error('Unable to load display playlist');
  }
}

export async function sendHeartbeat(displayId: string, battery?: number, network?: string) {
  if (battery !== undefined && (!Number.isInteger(battery) || battery < 0 || battery > 100)) return { success: false };
  if (network !== undefined && (typeof network !== 'string' || network.length > 32)) return { success: false };
  try {
    await prisma.$transaction(async (tx) => {
      // Only the most recent heartbeat is needed for connectivity status.
      await tx.heartbeat.deleteMany({ where: { displayId } });
      await tx.heartbeat.create({
        data: {
          displayId,
          battery,
          network,
        },
      });

      await tx.display.update({
        where: { id: displayId },
        data: { status: 'ONLINE', updatedAt: new Date() },
      });
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending heartbeat:', error);
    return { success: false };
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