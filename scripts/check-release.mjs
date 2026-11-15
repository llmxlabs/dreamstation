import { execFileSync } from 'node:child_process';

// Inspect Git's index, which is also the source of GitHub's release archives.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = files.filter(file => {
  if (file === '.env.example') return false;
  return /(^|\/)\.env(?:\.|$)/.test(file) ||
    /^(?:public\/uploads|\.release|\.security|\.next|node_modules|imports|downloads|gallery|browser-profile)(?:\/|$)/.test(file) ||
    /(?:\.db(?:-(?:wal|shm|journal))?|\.sqlite3?|\.pem|\.key)$/.test(file) ||
    /(^|\/)(?:library-sources|curation-preferences|excluded-media)\.json$/.test(file) ||
    /(^|\/)(?:Cookies|Login Data|Local State|DevToolsActivePort)$/.test(file);
});

if (forbidden.length) {
  console.error('Private files must be removed from Git before releasing:\n' + forbidden.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Release privacy check passed for ${files.length} tracked files.`);
}
