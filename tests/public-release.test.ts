import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-public-check-'));
  execFileSync('git', ['init', '-q', root]);
  const files = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/ci.yml', '.github/workflows/release.yml'];
  for (const name of files) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), 'public fixture\n');
  }
  await copyFile(resolve('scripts/release/check-public.mjs'), join(root, 'check.mjs'));
  return root;
}
function check(root: string) {
  return execFileSync(process.execPath, ['check.mjs'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}
test('public source check validates links and rejects generated artifacts', async () => {
  const root = await fixture();
  assert.match(check(root), /Public source check passed/);
  await writeFile(join(root, 'README.md'), '[guide](missing.md)\n');
  assert.throws(() => check(root), /unresolved link/);
  await writeFile(join(root, 'README.md'), '[license](LICENSE)\n');
  await mkdir(join(root, 'release'));
  await writeFile(join(root, 'release', 'artifact.txt'), 'local fixture');
  assert.throws(() => check(root), /local-only path/);
});
test('public source check reports personal paths without echoing their contents', async () => {
  const root = await fixture();
  await writeFile(join(root, 'README.md'), `/${['Users', 'fixture-person', 'Downloads'].join('/')}\n`);
  assert.throws(() => check(root), error => error instanceof Error && error.message.includes('personal absolute path') && !error.message.includes('fixture-person'));
});
