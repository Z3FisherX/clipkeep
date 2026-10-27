import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DownloadService } from '../electron/service';
import { detectTools } from '../electron/tools';
import { run } from '../electron/process';
import { createNetworkRunner } from '../electron/network/runner';
import { friendlyError } from '../electron/validation';
const root = resolve('evidence/access-recovery-20261023'); await mkdir(root, { recursive: true });
const tools = await detectTools(resolve('vendor/yt-dlp'));
async function save(id: string) {
  const service = new DownloadService({ saveDirectory: root, mock: false, runner: createNetworkRunner(run),
    detect: async () => tools, changed: () => {} });
  try {
    const info = await service.inspect(`https://vimeo.com/${id}`, false);
    const q = info.qualities.find(value => value.height <= 720) ?? info.qualities[0];
    console.log(JSON.stringify({ id, stage: 'metadata', quality: q?.label, duration: info.duration }));
    const job = await service.start({mode: info.audioId ? 'both' : 'video', qualityId: q.id, useBrowser: false });
    while (service.busy) await new Promise(resolve => setTimeout(resolve, 500));
    await writeFile(`${root}/vimeo-${id}-save.json`, JSON.stringify(job, null, 2));
    console.log(JSON.stringify({ id, stage: job.status, code: job.error?.code }));
  } catch (error) { console.log(JSON.stringify({ id, stage: 'error', ...friendlyError(error) })); }
}
await Promise.all((process.argv.slice(2).length ? process.argv.slice(2) : ['1175675830']).map(save));
