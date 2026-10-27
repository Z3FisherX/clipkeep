import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { posix } from 'node:path';

const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /^(?:node_modules|dist|dist-electron|release|evidence)(?:\/|$)|(^|\/)(?:secrets|credentials[^/]*)(?:\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/i;
const personalPath = /\/Users\/(?!you(?:\/|\b)|example(?:\/|\b))[^/\s"'<>]+\//;
const secretValue = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/;
const failures = [];
function checkLinks(path, text) {
  if (!path.endsWith('.md')) return;
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].replace(/^<|>$/g, '');
    if (!target || target.includes('://') || target.startsWith('mailto:')) continue;
    const name = posix.normalize(posix.join(posix.dirname(path), target)).replace(/\/$/, '');
    if (!paths.includes(name) && !paths.some(value => value.startsWith(`${name}/`))) failures.push(`${path}: unresolved link ${target}`);
  }
}
let bytes = 0;
for (const path of paths) {
  if (forbidden.test(path) || path === 'vendor/yt-dlp') { failures.push(`${path}: local-only path`); continue; }
  const info = await lstat(path);
  if (!info.isFile()) { failures.push(`${path}: expected regular file`); continue; }
  bytes += info.size;
  if (info.size > 10 * 1024 * 1024) { failures.push(`${path}: exceeds source file limit`); continue; }
  if (!/\.(?:png|icns)$/i.test(path)) {
    const text = await readFile(path, 'utf8');
    checkLinks(path, text);
    if (personalPath.test(text)) failures.push(`${path}: personal absolute path`);
    if (secretValue.test(text)) failures.push(`${path}: credential-like content`);
  }
}
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/ci.yml', '.github/workflows/release.yml']) {
  if (!paths.includes(name)) failures.push(`${name}: required public file`);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Public source check passed: ${paths.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
