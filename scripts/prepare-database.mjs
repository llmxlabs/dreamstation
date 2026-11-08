import 'dotenv/config';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
if (!url.startsWith('file:')) throw new Error('DreamStation requires a SQLite file: DATABASE_URL.');
const filename = path.resolve(url.replace(/^file:\/\//, '').replace(/^file:/, ''));
await mkdir(path.dirname(filename), { recursive: true });
// Append mode creates a missing database without truncating an existing one.
const file = await open(filename, 'a');
await file.close();
