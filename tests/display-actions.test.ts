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

    // A display saved before group selection was introduced still plays its collection.
    await prisma.display.update({ where: { id }, data: { config: { rotationInterval: 45, fitMode: 'cover' } } });
    assert.deepEqual((await displays.getDisplays())[0].playlistIds, [playlistId]);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 1);

    const second = await collections.createPlaylist('Second group');
    const secondId = second.playlist!.id;
    const video = await prisma.asset.create({ data: { userId, kind: 'VIDEO', originalUrl: '/uploads/test.mp4', size: 1 } });
    await collections.addAssetToPlaylist(secondId, asset.id);
    await collections.addAssetToPlaylist(secondId, video.id);
    assert.equal((await collections.assignPlaylistsToDisplay(id, [playlistId, secondId, playlistId])).success, true);
    assert.deepEqual((await displays.getDisplays())[0].playlistIds, [playlistId, secondId]);
    assert.deepEqual((await displays.getDisplayPlaylist(id))?.assets.map(a => a.id), [asset.id, video.id], 'overlapping groups play each asset once');

    // Settings edits preserve checked groups, and group edits preserve playback settings.
    await displays.updateDisplayConfig(id, { rotationInterval: 55 });
    assert.deepEqual((await displays.getDisplays())[0].playlistIds, [playlistId, secondId]);
    assert.deepEqual((await displays.getDisplayPlaylist(id))?.config, { rotationInterval: 55, fitMode: 'cover' });
    const addedLater = await prisma.asset.create({ data: { userId, kind: 'IMAGE', originalUrl: '/uploads/later.webp', size: 1 } });
    await collections.addAssetToPlaylist(secondId, addedLater.id);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 3, 'new artwork in a checked group appears without reassignment');

    const otherUser = await prisma.user.create({ data: { email: 'other@example.invalid', password: 'unused' } });
    const foreign = await prisma.playlist.create({ data: { userId: otherUser.id, name: 'Other profile' } });
    await prisma.asset.create({ data: { userId: otherUser.id, kind: 'IMAGE', originalUrl: '/uploads/private.webp', size: 1 } });
    assert.equal((await collections.assignPlaylistsToDisplay(id, [playlistId, secondId], true)).success, true);
    const ungrouped = await prisma.asset.create({ data: { userId, kind: 'IMAGE', originalUrl: '/uploads/ungrouped.webp', size: 1 } });
    assert.equal((await displays.getDisplays())[0].playAll, true);
    assert.equal((await displays.getDisplays())[0].libraryAssetCount, 4);
    assert.deepEqual(new Set((await displays.getDisplayPlaylist(id))?.assets.map(a => a.id)), new Set([asset.id, video.id, addedLater.id, ungrouped.id]), 'all artwork includes future uploads outside groups and excludes other profiles');
    await displays.updateDisplayConfig(id, { rotationInterval: 55 });
    assert.equal((await displays.getDisplays())[0].playAll, true, 'settings preserve automatic inclusion');

    // The stable HTTP API observes writes from another process without cached actions.
    const playlistApi = await import('../src/app/api/displays/[displayId]/playlist/route');
    const eventsApi = await import('../src/app/api/displays/[displayId]/events/route');
    const heartbeatApi = await import('../src/app/api/displays/[displayId]/heartbeat/route');
    const params = { params: Promise.resolve({ displayId: id }) };
    const apiResponse = await playlistApi.GET(new Request('http://localhost/playlist'), params);
    assert.equal(apiResponse.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal((await apiResponse.json()).assets.length, 4);
    const abort = new AbortController();
    const stream = await eventsApi.GET(new Request('http://localhost/events', { signal: abort.signal }), params);
    assert.equal(stream.headers.get('content-type'), 'text/event-stream');
    const reader = stream.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: sync/);
    const invalidated = reader.read();
    execFileSync(process.execPath, ['-e', 'const D=require("better-sqlite3"); const d=new D(process.argv[1]); d.prepare("UPDATE Asset SET originalUrl=? WHERE id=?").run("/uploads/replaced.webp",process.argv[2]); d.close()', join(directory, 'test.db'), ungrouped.id]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const event = await Promise.race([invalidated, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('No live update from external SQLite write')), 3000); })]);
      assert.match(new TextDecoder().decode(event.value), /event: sync/);
    } finally { clearTimeout(timeout); abort.abort(); }
    assert.equal((await reader.read()).done, true, 'disconnect releases the event stream');
    assert.equal((await (await playlistApi.GET(new Request('http://localhost/playlist'), params)).json()).assets.find((a: { id: string }) => a.id === ungrouped.id).originalUrl, '/uploads/replaced.webp');
    assert.equal((await heartbeatApi.POST(new Request('http://localhost/heartbeat', { method: 'POST', body: JSON.stringify({ network: 'wifi' }) }), params)).status, 200);
    assert.equal((await heartbeatApi.POST(new Request('http://localhost/heartbeat', { method: 'POST', body: JSON.stringify({ battery: 101 }) }), params)).status, 400);
    const missingParams = { params: Promise.resolve({ displayId: 'missing' }) };
    assert.equal((await playlistApi.GET(new Request('http://localhost/playlist'), missingParams)).status, 404);
    assert.equal((await eventsApi.GET(new Request('http://localhost/events'), missingParams)).status, 404);

    assert.equal((await collections.assignPlaylistsToDisplay(id, [playlistId, secondId], false)).success, true);
    assert.equal((await displays.getDisplays())[0].playAll, false);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 3, 'turning off All artwork restores the checked groups');
    for (const invalid of ['not-an-array', [playlistId, 42], [playlistId, 'missing-playlist'], [foreign.id]]) {
      assert.equal((await collections.assignPlaylistsToDisplay(id, invalid)).success, false);
      assert.deepEqual((await displays.getDisplays())[0].playlistIds, [playlistId, secondId], 'rejected selections leave playback intact');
    }
    assert.equal((await collections.assignPlaylistsToDisplay(id, [])).success, true);
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 0, 'clearing all groups stops the playlist');
    assert.equal((await collections.assignPlaylistToDisplay(id, playlistId)).success, true);
    assert.deepEqual((await displays.getDisplays())[0].playlistIds, [playlistId], 'older clients can still replace the selection');
    failRefresh = true;
    assert.equal((await collections.assignPlaylistsToDisplay(id, [playlistId, secondId])).success, true);
    failRefresh = false;

    assert.equal((await collections.deletePlaylist(playlistId)).success, true);
    assert.deepEqual((await displays.getDisplays())[0].playlistIds, [secondId], 'deleting the first selected group preserves the remaining group');
    assert.equal((await displays.getDisplayPlaylist(id))?.assets.length, 3);
    assert.deepEqual((await displays.getDisplayPlaylist(id))?.config, { rotationInterval: 55, fitMode: 'cover' });
    assert.equal((await collections.deletePlaylist(secondId)).success, true);
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
