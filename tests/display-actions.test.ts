import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

test('display and collection lifecycle on an isolated database', async (context) => {
  context.mock.method(console, 'error', () => {});
  const directory = await mkdtemp(join(tmpdir(), 'dreamstation-display-test-'));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const require = createRequire(import.meta.url);
  const cachePath = require.resolve('next/cache');
  const previousCache = require.cache[cachePath];
  // Server actions normally receive this request-scoped function from Next.js.
  let failRefresh = false;
  require.cache[cachePath] = { exports: { revalidatePath() { if (failRefresh) throw new Error('Test cache failure'); } } } as NodeModule;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const schemaSql = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], {
      env: process.env, stdio: 'pipe',
    }).toString();
    const Database = require('better-sqlite3');
    const database = new Database(join(directory, 'test.db'));
    database.exec(schemaSql);
    database.close();
    const { default: prisma } = await import('../src/lib/prisma');
    disconnect = () => prisma.$disconnect();
    const displays = await import('../src/actions/displays');
    const collections = await import('../src/actions/playlists');
    const userId = '00000000-0000-0000-0000-000000000000';
    await prisma.user.create({ data: { id: userId, email: 'test@example.invalid', password: 'unused' } });

    assert.equal((await displays.pairDisplay('bad', 'TV')).success, false);
    assert.equal((await collections.createPlaylist('   ')).success, false);
    const code = await displays.generatePairingCode();
    assert.equal(code.success, true);
    assert.match(code.code!, /^\d{6}$/);
    const paired = await displays.pairDisplay(code.code!, '  Living room  ');
    assert.equal(paired.success, true);
    assert.equal((await displays.pairDisplay(code.code!, 'Duplicate')).success, false);
    assert.equal(await prisma.display.count(), 1);
    const expiredCode = await displays.generatePairingCode();
    await prisma.pairingCode.update({ where: { code: expiredCode.code! }, data: { expiresAt: new Date(0) } });
    assert.equal((await displays.pairDisplay(expiredCode.code!, 'Expired')).success, false);
    assert.equal(await prisma.display.count(), 1);
    const id = paired.displayId!;
    assert.equal((await displays.getDisplays())[0].status, 'OFFLINE');

    await displays.updateDisplayConfig(id, { rotationInterval: 45 });
    await displays.updateDisplayConfig(id, { fitMode: 'cover' });
    assert.deepEqual((await displays.getDisplayPlaylist(id))?.config, { rotationInterval: 45, fitMode: 'cover' });
    assert.equal((await displays.updateDisplayConfig(id, { rotationInterval: -1 })).success, false);
    assert.equal((await displays.sendHeartbeat(id, 101)).success, false);
    await displays.sendHeartbeat(id, 90, 'wifi');
    await displays.sendHeartbeat(id, 89, 'wifi');
    assert.equal(await prisma.heartbeat.count(), 1);
    assert.equal((await displays.getDisplays())[0].status, 'ONLINE');
    await prisma.heartbeat.updateMany({ data: { seenAt: new Date(Date.now() - 120000) } });
    assert.equal((await displays.getDisplays())[0].status, 'OFFLINE');

    failRefresh = true;
    const playlist = await collections.createPlaylist(' Test collection ');
    failRefresh = false;
    assert.equal(playlist.success, true);
    const asset = await prisma.asset.create({ data: { userId, kind: 'IMAGE', originalUrl: '/uploads/test.webp', size: 1 } });
    const playlistId = playlist.playlist!.id;
    await collections.addAssetToPlaylist(playlistId, asset.id);
    await collections.addAssetToPlaylist(playlistId, asset.id);
    assert.equal(await prisma.playlistItem.count(), 1);
    await collections.assignPlaylistToDisplay(id, playlistId);
    assert.equal((await collections.assignPlaylistToDisplay(id, 'missing-playlist')).success, false);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 1);
    assert.equal((await collections.deletePlaylist(playlistId)).success, true);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 0);
    assert.equal(await prisma.playlistItem.count(), 0);
    assert.equal((await displays.deleteDisplay(id)).success, true);
    assert.equal(await prisma.heartbeat.count(), 0);
    assert.equal(await prisma.display.count(), 0);
  } finally {
    await disconnect?.();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousCache) require.cache[cachePath] = previousCache;
    else delete require.cache[cachePath];
    await rm(directory, { recursive: true, force: true });
  }
});
