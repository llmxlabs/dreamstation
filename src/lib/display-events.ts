import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { getDatabasePath } from './database-path';

// Watching SQLite also catches uploads made by the separate CLI process.
export function createDisplayEventStream(signal: AbortSignal) {
  let stop = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let watcher: FSWatcher | undefined;
      let debounce: ReturnType<typeof setTimeout> | undefined;
      let keepalive: ReturnType<typeof setInterval> | undefined;
      stop = () => {
        if (closed) return;
        closed = true;
        watcher?.close();
        clearTimeout(debounce);
        clearInterval(keepalive);
        signal.removeEventListener('abort', stop);
        try { controller.close(); } catch { /* Already closed by stream cancellation. */ }
      };
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) { stop(); return; }
      const send = (data: string) => { if (!closed) controller.enqueue(encoder.encode(data)); };
      send('retry: 2000\nevent: sync\ndata: {}\n\n');
      const database = getDatabasePath();
      const filename = basename(database);
      try {
        watcher = watch(dirname(database), (_event, changed) => {
          if (changed && ![filename, `${filename}-wal`, `${filename}-journal`, `${filename}-shm`].includes(changed.toString())) return;
          // Coalesce events without postponing updates during a large import.
          if (!debounce) debounce = setTimeout(() => {
            debounce = undefined;
            send('event: sync\ndata: {}\n\n');
          }, 200);
        });
        watcher.on('error', stop);
        keepalive = setInterval(() => send(': keepalive\n\n'), 15000);
      } catch {
        // EventSource reconnects; the player's short polling remains available.
        stop();
      }
    },
    cancel() { stop(); },
  });
}
