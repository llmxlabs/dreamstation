import 'dotenv/config';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { prepareUrlImport, commitUrlImport, exportUrlImport, importDownloadDirectory, publicImportError } from '../src/lib/media-importer';
import prisma from '../src/lib/prisma';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    output: { type: 'string', short: 'o' }, collection: { type: 'string', short: 'c' },
    'download-only': { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !positionals.length) {
    console.log('Usage: npm run grab -- <post-url> [--collection "Group name"] [--output ./downloads] [--download-only]\n\nDownloads original images/videos from X, Midjourney and Grok Imagine directly into DreamStation.\n--collection selects or creates a group; otherwise the source group is used.\n--output also exports copies. --download-only saves files without adding them to the gallery.\nUse the web preview to review unfamiliar artwork before importing it.');
    return;
  }
  if (positionals.length !== 1) throw new Error('Use one source link per command.');
  const preview = await prepareUrlImport(positionals[0]);
  if (!values['download-only']) {
    const result = await commitUrlImport(preview.id, preview.items.map(item => item.id), { collectionName: values.collection });
    console.log(JSON.stringify({ added: result.added, reused: result.reused, collection: result.collection, files: result.assets.map(asset => resolve('public' + asset.originalUrl)) }, null, 2));
    if (values.output) console.log(JSON.stringify({ downloaded: await exportUrlImport(preview.id, resolve(values.output)) }, null, 2));
  } else {
    console.log(JSON.stringify({ downloaded: await exportUrlImport(preview.id, values.output ? resolve(values.output) : importDownloadDirectory()) }, null, 2));
  }
}
main().catch(error => { console.error(publicImportError(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
