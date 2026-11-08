import { open } from 'node:fs/promises';
import { uploadPath } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };

async function serve(request: Request, context: { params: Promise<{ filename: string }> }, head: boolean) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const { filename } = await context.params;
    const contentType = types[filename.split('.').pop()?.toLowerCase() || ''];
    if (!contentType || /[/\\\x00]/.test(filename)) return new Response(null, { status: 404 });
    handle = await open(uploadPath(`/uploads/${filename}`), 'r');
    const info = await handle.stat();
    if (!info.isFile()) { await handle.close(); return new Response(null, { status: 404 }); }
    const size = info.size;
    let start = 0, end = size - 1, status = 200;
    const headers = new Headers({ 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      }
      if (!match || (!match[1] && !match[2]) || start > end || start >= size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        await handle.close();
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      status = 206;
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (head || size === 0) { await handle.close(); return new Response(null, { status, headers }); }
    const file = handle;
    let position = start;
    let closed = false;
    const close = async () => { if (!closed) { closed = true; await file.close(); } };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const buffer = Buffer.alloc(Math.min(64 * 1024, end - position + 1));
          const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
          if (!bytesRead) { await close(); controller.close(); return; }
          position += bytesRead;
          controller.enqueue(buffer.subarray(0, bytesRead));
          if (position > end) { await close(); controller.close(); }
        } catch (error) { await close(); controller.error(error); }
      },
      cancel: close,
    });
    return new Response(stream, { status, headers });
  } catch {
    await handle?.close().catch(() => {});
    return new Response(null, { status: 404 });
  }
}
export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) { return serve(request, context, false); }
export async function HEAD(request: Request, context: { params: Promise<{ filename: string }> }) { return serve(request, context, true); }
