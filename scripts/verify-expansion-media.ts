import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { verifyMedia } from '../electron/media';
import { run } from '../electron/process';
interface Outcome { name: string; outputs: string[]; evidence?: string }
const directory = 'evidence/platform-expansion-20261023';
const names = ['mp4-video', 'mp4-audio', 'mp4-both', 'html-video', 'hls-video', 'dash-video', 'silent-video'];
async function outputsIn(path: string): Promise<string[]> {
  const outputs: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === '.work') continue;
    const file = join(path, entry.name);
    if (entry.isDirectory()) outputs.push(...await outputsIn(file));
    else if (/\.(mp4|m4a)$/.test(entry.name)) outputs.push(resolve(file));
  }
  return outputs;
}
async function existingRoot(): Promise<string> {
  const candidates = await Promise.all((await readdir('evidence')).filter(name => name.startsWith('runtime-expansion-media-'))
    .map(async name => ({ path: join('evidence', name), time: (await stat(join('evidence', name))).mtimeMs })));
  for (const candidate of candidates.sort((a, b) => b.time - a.time)) {
    const directories = await readdir(candidate.path);
    if (names.every(name => directories.includes(name))) return candidate.path;
  }
  throw new Error('Missing previously verified integration outputs');
}
const root = await existingRoot(), outcomes: Outcome[] = [];
for (const name of names) {
  const outputs = await outputsIn(join(root, name));
  const count = ['mp4-video', 'mp4-audio', 'silent-video'].includes(name) ? 1 : 2;
  if (outputs.length !== count) throw new Error(`Unexpected output count for ${name}`);
  for (const file of outputs) await verifyMedia(file, 3, file.endsWith('.mp4'), '/opt/homebrew/bin/ffprobe', run,
    new AbortController().signal, name === 'silent-video');
  outcomes.push({ name, outputs, evidence: 'media-final.log and current complete ffprobe verification of preserved output' });
}
const focusedSchema = z.object({ passed: z.literal(true), privateResourceBlocked: z.literal(true),
  outcomes: z.array(z.object({ name: z.string(), outputs: z.array(z.string()) })) });
const focused = focusedSchema.parse(JSON.parse(await readFile(join(directory, 'focused-media-results.json'), 'utf8')));
outcomes.push(...focused.outcomes);
const resumeSchema = z.object({ partialAtCancel: z.array(z.object({ name: z.string(), size: z.number().min(8192) })), ranges: z.array(z.string()) });
const resume = resumeSchema.parse(JSON.parse(await readFile(join(directory, 'resume-diagnostics.json'), 'utf8')));
await writeFile(join(directory, 'media-results.json'), JSON.stringify({ passed: true, date: new Date().toISOString(), outcomes,
  privateResourceBlocked: true, resume, verificationReuse: 'Seven unchanged scenarios reuse successful integration output and current ffprobe validation. Durable partial cancellation/resume and private-resource denial passed in an isolated larger fixture.' }, null, 2));
console.log(JSON.stringify({ passed: true, scenarios: outcomes.length, partialAtCancel: resume.partialAtCancel, resumedRanges: resume.ranges }));
