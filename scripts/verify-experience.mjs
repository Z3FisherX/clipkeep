import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve('evidence/user-optimization-20261103'); await mkdir(root, { recursive: true });
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))].sort();
const code = paths.filter(path => /^(electron|shared|src|tests|scripts)\//.test(path) || /^(package.*json|tsconfig.json|vite.config.ts|eslint.config.mjs)$/.test(path));
const hash = createHash('sha256');
for (const path of code) hash.update(path).update(await readFile(path));
const inputs = { runtimeSha256: hash.digest('hex'), files: code, node: process.version, platform: process.platform, architecture: process.arch,
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  lockSha256: createHash('sha256').update(await readFile('package-lock.json')).digest('hex') };
const checks = [];
const commands = process.argv.slice(2).length ? process.argv.slice(2) : ['check:public', 'audit:dependencies', 'typecheck', 'lint', 'test', 'build', 'check:signing'];
for (const name of commands) {
  const log = join(root, `final-${name.replaceAll(':', '-')}.log`), file = await open(log, 'w');
  const startedAt = new Date().toISOString();
  const exitCode = await new Promise(done => {
    const child = spawn('npm', ['run', name], { shell: false, stdio: ['ignore', file.fd, file.fd] });
    child.on('exit', value => done(value ?? 1)); child.on('error', () => done(1));
  });
  await file.close();
  const summary = (await readFile(log, 'utf8')).trim().split('\n').slice(-10).join('\n');
  checks.push({ command: `npm run ${name}`, exitCode, startedAt, endedAt: new Date().toISOString(), log, summary });
  console.log(`${exitCode === 0 ? 'PASS' : 'FAIL'} npm run ${name}`);
  await writeFile(join(root, `verification-${commands[0].replaceAll(':', '-')}.json`), JSON.stringify({ inputs, checks }, null, 2));
  if (exitCode) { console.log(summary); process.exitCode = 1; break; }
}
