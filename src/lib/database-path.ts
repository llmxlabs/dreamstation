import path from 'node:path';

export function getDatabasePath() {
  const raw = process.env.DATABASE_URL;
  const url = !raw || raw === 'undefined' ? 'file:./prisma/dev.db' : raw;
  return path.resolve(/* turbopackIgnore: true */ url.replace(/^file:\/\//, '').replace(/^file:/, ''));
}
