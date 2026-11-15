import { extractPageMedia, extractXMedia, isImportMediaUrl, type ImportTarget, type PageMediaSnapshot, type SourceMedia } from './import-source';
import { MAX_FILE_BYTES } from './storage';

type CdpEvent = { requestId?: string; response?: { url: string } };
type Cdp = { send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>; onEvent(listener: (method: string, params: CdpEvent) => void): void; close(): void };
export async function connectImportPage(endpoint: string): Promise<Cdp> {
  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('The source browser did not respond.')); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to the source browser.')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners: ((method: string, params: CdpEvent) => void)[] = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: CdpEvent; error?: { message: string }; result?: unknown };
    const task = message.id === undefined ? undefined : pending.get(message.id);
    if (task && message.id !== undefined) { pending.delete(message.id); clearTimeout(task.timer); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); }
    else if (message.method) for (const listener of listeners) listener(message.method, message.params || {});
  });
  return {
    send<T>(method: string, params: Record<string, unknown> = {}) { const id = ++sequence; return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('The source took too long to respond.')); }, 45000); pending.set(id, { resolve: value => resolve(value as T), reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); },
    onEvent(listener) { listeners.push(listener); },
    close() { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Source connection closed.')); } pending.clear(); socket.close(); },
  };
}

const snapshotExpression = `(() => ({
 title:document.title,text:(document.querySelector('main')||document.body).innerText.slice(0,12000),
 images:[...document.images].map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight})),
 videos:[...document.querySelectorAll('video')].flatMap(v=>[v.currentSrc||v.src,...[...v.querySelectorAll('source')].map(s=>s.src)]).filter(Boolean),
 metadata:Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(m=>[m.getAttribute('property'),m.getAttribute('content')])),
 downloads:[...document.querySelectorAll('a[download]')].map(a=>a.href)
}))()`;

export async function withSourceBrowser<T>(target: ImportTarget, action: (media: SourceMedia[], download: (url: string) => Promise<{ bytes: Buffer; mime: string }>) => Promise<T>): Promise<T> {
  const browserUrl = new URL(process.env.DREAMSTATION_BROWSER_URL || 'http://127.0.0.1:9222');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(browserUrl.hostname) || browserUrl.protocol !== 'http:') throw new Error('The import browser must use a local connection.');
  let tab: { id: string; webSocketDebuggerUrl: string };
  try {
    const response = await fetch(new URL('/json/new?about:blank', browserUrl), { method: 'PUT', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    tab = await response.json();
  } catch { throw new Error('The source browser is not connected. Start Chromium on this server with remote debugging enabled, then sign in to the source site.'); }
  let client: Cdp | undefined;
  try {
    client = await connectImportPage(tab.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Network.enable', { maxTotalBufferSize: 24000000, maxResourceBufferSize: 8000000 });
    let xMedia: SourceMedia[] = [];
    const waiting = new Map<string, string>();
    const jobs = new Set<Promise<void>>();
    client.onEvent((method, params) => {
      if (!params.requestId) return;
      if (method === 'Network.responseReceived' && target.provider === 'X' && params.response?.url.includes('/i/api/graphql/') && /TweetDetail|TweetResultByRestId/.test(params.response.url)) waiting.set(params.requestId, params.response.url);
      if (method !== 'Network.loadingFinished' || !waiting.has(params.requestId)) return;
      waiting.delete(params.requestId);
      const job = client!.send<{ body: string; base64Encoded?: boolean }>('Network.getResponseBody', { requestId: params.requestId }).then(result => {
        const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body;
        if (body.length <= 8000000) { const found = extractXMedia(JSON.parse(body), target); if (found.length) xMedia = found; }
      }).catch(() => {}).finally(() => jobs.delete(job));
      jobs.add(job);
    });
    await client.send('Page.bringToFront');
    await client.send('Page.navigate', { url: target.direct ? 'about:blank' : target.url });
    let media: SourceMedia[] = target.direct ? [{ url: target.url, kind: /\.(mp4|webm)(?:\?|$)/i.test(target.url) ? 'VIDEO' : 'IMAGE' }] : [];
    if (!target.direct) {
      let opened = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        const state = await client.send<{ result: { value?: PageMediaSnapshot } }>('Runtime.evaluate', { expression: snapshotExpression, returnByValue: true });
        const page = state.result.value;
        if (!page) continue;
        if (!opened) {
          // Open the artwork itself before reading its full-size URI.
          await client.send<{ result: { value?: boolean } }>('Runtime.evaluate', { expression: `(() => {const image=[...document.images].filter(i=>/pbs\\.twimg\\.com\\/media\\/|cdn\\.midjourney\\.com|assets\\.grok\\.com|imagine-public\\.x\\.ai/.test(i.src)&&i.naturalWidth>=256).sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)[0];if(image){image.click();return true;}return !!document.querySelector('video');})()`, returnByValue: true }).then(r => { opened = Boolean(r.result.value); });
        }
        media = target.provider === 'X' ? xMedia : extractPageMedia(page, target);
        if (media.length && opened) break;
      }
      await Promise.allSettled([...jobs]);
      if (target.provider === 'X' && xMedia.length) media = xMedia;
      if (!media.length) throw new Error('No downloadable media was found. Open this post in Chromium, sign in or complete any site verification, and try again.');
    }
    if (media.length > 20) throw new Error('This post contains more than 20 files. Use a link to one image or video.');
    const { frameTree } = await client.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree');
    const download = async (url: string) => {
      if (!isImportMediaUrl(url)) throw new Error('The media URI is outside the supported source sites.');
      const { resource } = await client!.send<{ resource: { success: boolean; stream?: string; httpStatusCode?: number; headers?: Record<string, string> } }>('Network.loadNetworkResource', { frameId: frameTree.frame.id, url, options: { disableCache: false, includeCredentials: true } });
      const handle = resource.stream;
      if (!resource.success || !handle || resource.httpStatusCode !== 200) { if (handle) await client!.send('IO.close', { handle }); throw new Error(`The source could not download this file (HTTP ${resource.httpStatusCode || 0}).`); }
      try {
        const headers = Object.fromEntries(Object.entries(resource.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
        const mime = headers['content-type']?.split(';')[0].trim() || '';
        if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(mime)) throw new Error('The source returned a page rather than an image or video.');
        if (Number(headers['content-length']) > MAX_FILE_BYTES) throw new Error('This file exceeds the 50 MB upload limit.');
        const chunks: Buffer[] = [];
        let size = 0;
        while (true) {
          const part = await client!.send<{ data: string; base64Encoded?: boolean; eof?: boolean }>('IO.read', { handle, size: 1048576 });
          const bytes = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
          size += bytes.length;
          if (size > MAX_FILE_BYTES) throw new Error('This file exceeds the 50 MB upload limit.');
          chunks.push(bytes);
          if (part.eof) break;
        }
        return { bytes: Buffer.concat(chunks), mime };
      } finally { await client!.send('IO.close', { handle }).catch(() => {}); }
    };
    return await action(media, download);
  } finally {
    client?.close();
    await fetch(new URL('/json/close/' + tab.id, browserUrl), { signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
