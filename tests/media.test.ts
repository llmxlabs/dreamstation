import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// All uploads and database writes are confined to this test's temporary directory.
test('media validation, storage and streaming on isolated data', async (t) => {
  const root = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'dreamstation-media-test-'));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const require = createRequire(import.meta.url);
  const cachePath = require.resolve('next/cache');
  const previousCache = require.cache[cachePath];
  let invalidateFails = false;
  require.cache[cachePath] = { exports: { revalidatePath() { if (invalidateFails) throw new Error('cache unavailable'); } } } as NodeModule;
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(childEnv).find(key => key.toLowerCase() === 'path') || 'PATH';
  childEnv[pathKey] = `${join(root, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${childEnv[pathKey] || ''}`;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const setupCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
    const setupArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run db:setup'] : ['run', 'db:setup'];
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(setupCommand, setupArgs, { cwd: root, env: childEnv, stdio: 'pipe', encoding: 'utf8' });
    }
    const { default: prisma } = await import('../src/lib/prisma');
    disconnect = () => prisma.$disconnect();
    assert.equal(await prisma.user.count(), 1, 'setup and reseed create one local profile');
    assert.equal((await prisma.user.findFirst())?.id, '00000000-0000-0000-0000-000000000000');
    const storage = await import('../src/lib/storage');
    const actions = await import('../src/actions/assets');
    const route = await import('../src/app/uploads/[filename]/route');
    await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
    process.chdir(directory);
    await mkdir(storage.uploadDirectory(), { recursive: true });
    const png = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#4851bb' } }).png().toBuffer();
    const image = () => new File([new Uint8Array(png)], '../../unsafe-name.html', { type: 'image/png' });
    const list = () => readdir(storage.uploadDirectory());

    await t.test('rejects malformed uploads, MIME spoofing and traversal without residue', async () => {
      assert.throws(() => storage.validateFile(new File([], 'empty.png', { type: 'image/png' })));
      const oversized = image(); Object.defineProperty(oversized, 'size', { value: storage.MAX_FILE_BYTES + 1 });
      assert.throws(() => storage.validateFile(oversized), /50 MB/);
      assert.throws(() => storage.validateFile(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })));
      for (const path of ['/uploads/../secret.png', '/uploads/a/b.png', '/uploads/a\\b.png', '/uploads/..', '/other/a.png', '/uploads/a\0.png']) assert.throws(() => storage.uploadPath(path));
      await assert.rejects(storage.saveFile(new File([new Uint8Array(png)], 'spoof.jpg', { type: 'image/jpeg' })), /file type/);
      await assert.rejects(storage.saveFile(new File(['not an image'], 'fake.png', { type: 'image/png' })), /decode/);
      await assert.rejects(storage.saveFile(new File(['0000ftypgarbage'], 'fake.mp4', { type: 'video/mp4' })), /decode/);
      assert.deepEqual(await list(), []);
      const invalid = new FormData(); invalid.append('file', 'not a file');
      assert.equal((await actions.uploadAsset(invalid)).success, false);
      assert.equal((await actions.uploadAsset(new FormData())).success, false);
      assert.equal(await prisma.asset.count(), 0);
    });

    await t.test('writes safe filenames and rolls back the entire partially valid batch', async () => {
      const batch = new FormData(); batch.append('file', image()); batch.append('file', new File(['broken'], 'bad.png', { type: 'image/png' }));
      assert.equal((await actions.uploadAsset(batch)).success, false);
      assert.deepEqual(await list(), []);
      assert.equal(await prisma.asset.count(), 0);
      const saved = await storage.saveFile(image());
      assert.match(saved.original, /^\/uploads\/[a-f0-9-]+\.png$/);
      assert.deepEqual(await readFile(storage.uploadPath(saved.original)), png);
      assert.equal((await sharp(await readFile(storage.uploadPath(saved.thumbnail!))).metadata()).width, 400);
      for (const url of [saved.original, saved.resized!, saved.thumbnail!]) await storage.deleteFile(url);
      await storage.deleteFile(saved.original);
      assert.deepEqual(await list(), []);
    });

    await t.test('streams full files, bounded/open/suffix ranges and HEAD; rejects invalid ranges', async () => {
      await writeFile(storage.uploadPath('/uploads/range.mp4'), Buffer.from('0123456789'));
      const request = (range?: string) => new Request('http://localhost/uploads/range.mp4', { headers: range ? { range } : {} });
      const context = { params: Promise.resolve({ filename: 'range.mp4' }) };
      const full = await route.GET(request(), context);
      assert.equal(full.status, 200); assert.equal(await full.text(), '0123456789');
      assert.equal(full.headers.get('content-type'), 'video/mp4');
      assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
      for (const [range, expected, contentRange] of [['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-99', '89', 'bytes 8-9/10']]) {
        const result = await route.GET(request(range), context);
        assert.equal(result.status, 206); assert.equal(await result.text(), expected); assert.equal(result.headers.get('content-range'), contentRange);
      }
      for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'items=1-2']) {
        const result = await route.GET(request(range), context); assert.equal(result.status, 416); assert.equal(result.headers.get('content-range'), 'bytes */10');
      }
      const head = await route.HEAD(request(), context); assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(head.headers.get('content-length'), '10');
      for (const filename of ['../test.db', '..\\test.db', 'evil.html', 'missing.png']) assert.equal((await route.GET(request(), { params: Promise.resolve({ filename }) })).status, 404);
      await storage.deleteFile('/uploads/range.mp4');
    });

    await t.test('decodes a native FFmpeg clip and creates its thumbnail', async () => {
      const ffmpeg = join(root, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      const clip = join(directory, 'sample.mp4');
      execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=320x180:d=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', clip], { windowsHide: true, timeout: 30000 });
      const saved = await storage.saveFile(new File([new Uint8Array(await readFile(clip))], 'sample.mp4', { type: 'video/mp4' }));
      assert.equal(saved.resized, null);
      const metadata = await sharp(await readFile(storage.uploadPath(saved.thumbnail!))).metadata();
      assert.equal(metadata.format, 'webp'); assert.ok(metadata.width! <= 400);
      await storage.deleteFile(saved.original); await storage.deleteFile(saved.thumbnail!);
    });

    await t.test('rejects audio-only MP4 rather than returning a missing thumbnail', async () => {
      const ffmpeg = join(root, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      const clip = join(directory, 'audio-only.mp4');
      execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'aac', '-y', clip], { windowsHide: true, timeout: 30000 });
      await assert.rejects(storage.saveFile(new File([new Uint8Array(await readFile(clip))], 'audio-only.mp4', { type: 'video/mp4' })), /decode/);
      assert.deepEqual(await list(), []);
    });

    await t.test('database rejection removes every saved derivative', async () => {
      const user = (await prisma.user.findFirst())!;
      await prisma.user.delete({ where: { id: user.id } });
      try {
        const form = new FormData(); form.append('file', image());
        assert.equal((await actions.uploadAsset(form)).success, false);
        assert.equal(await prisma.asset.count(), 0); assert.deepEqual(await list(), []);
      } finally { await prisma.user.create({ data: user }); }
    });

    await t.test('unknown internal errors are sanitized and files rolled back', async () => {
      const originalTransaction = prisma.$transaction;
      prisma.$transaction = (() => { throw new Error('Internal database location: /private/operator/data.db'); }) as typeof prisma.$transaction;
      try {
        const form = new FormData(); form.append('file', image());
        const result = await actions.uploadAsset(form);
        assert.equal(result.success, false);
        assert.equal(result.error, 'Upload failed. Check database setup and available disk space.');
        assert.deepEqual(await list(), []);
      } finally { prisma.$transaction = originalTransaction; }
    });

    await t.test('committed asset remains readable if cache invalidation fails', async () => {
      const form = new FormData(); form.append('file', image());
      invalidateFails = true;
      assert.equal((await actions.uploadAsset(form)).success, true);
      invalidateFails = false;
      const assets = await prisma.asset.findMany();
      assert.equal(assets.length, 1);
      assert.deepEqual(await readFile(storage.uploadPath(assets[0].originalUrl)), png);
      assert.equal((await actions.deleteAsset(assets[0].id)).success, true);
      assert.equal(await prisma.asset.count(), 0); assert.deepEqual(await list(), []);
    });
  } finally {
    process.chdir(root);
    await disconnect?.();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousCache) require.cache[cachePath] = previousCache; else delete require.cache[cachePath];
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});


