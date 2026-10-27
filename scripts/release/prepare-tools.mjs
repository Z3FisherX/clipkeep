import { createHash } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('vendor/yt-dlp.json', 'utf8'));
const target = 'vendor/yt-dlp';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const existing = await readFile(target).catch(error => {
  if (error.code === 'ENOENT') return undefined;
  throw error;
});
if (existing && digest(existing) === manifest.sha256) {
  await chmod(target, 0o755);
  console.log(`Verified yt-dlp ${manifest.version}`);
} else {
  const response = await globalThis.fetch(manifest.url, { signal: globalThis.AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`yt-dlp download: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== manifest.sha256) throw new Error('yt-dlp SHA256 mismatch');
  await writeFile(`${target}.download`, bytes, { mode: 0o755 });
  await chmod(`${target}.download`, 0o755);
  await rename(`${target}.download`, target);
  console.log(`Prepared yt-dlp ${manifest.version}`);
}
