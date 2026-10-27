import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const root = resolve(process.env.CLIPKEEP_PACKAGE_OUT || 'release');
const source = join(root, '拾片-darwin-arm64');
const zip = join(root, `Clipkeep-${version}-mac-arm64.zip`);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', join(source, '拾片.app')], { stdio: 'inherit' });
await copyFile(`docs/releases/${version}.md`, join(source, 'RELEASE-NOTES.md'));
await copyFile('docs/USER-GUIDE.md', join(source, 'USER-GUIDE.md'));
execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', source, zip]);
execFileSync('/usr/bin/unzip', ['-tq', zip], { stdio: 'inherit' });
const hash = createHash('sha256');
for await (const chunk of createReadStream(zip)) hash.update(chunk);
await writeFile(join(root, 'SHA256SUMS.txt'), `${hash.digest('hex')}  ${basename(zip)}\n`);
console.log(zip);
