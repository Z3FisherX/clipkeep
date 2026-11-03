import { mkdtemp, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ReleaseInfo } from '../../shared/maintenance';
import type { Runner } from '../process';
import { AppError } from '../errors';
import { downloadVerified } from './download';
import { validateArchive } from './archive';
async function assertExtracted(root: string, path = root): Promise<void> {
  for (const name of await readdir(path)) {
    const file = join(path, name), entry = await lstat(file);
    if (entry.isSymbolicLink()) {
      const actual = await realpath(file);
      if (!actual.startsWith(root + sep)) throw new AppError('UPDATE_ARCHIVE', '安装包链接归属需要检查');
    } else if (entry.isDirectory()) await assertExtracted(root, file);
    else if (!entry.isFile()) throw new AppError('UPDATE_ARCHIVE', '安装包文件类型需要检查');
  }
}
export async function stageApplication(release: ReleaseInfo, dataDirectory: string, runner: Runner) {
  if (!release.assetUrl || !release.sha256) throw new AppError('UPDATE_CHECKSUM', '请先获取应用发行校验清单');
  const bytes = await downloadVerified(release.assetUrl, release.sha256, 500 * 1024 ** 2);
  validateArchive(bytes);
  const root = await mkdtemp(join(dataDirectory, 'application-update-')), archive = join(root, 'application.zip');
  await writeFile(archive, bytes, { mode: 0o600 });
  const listing = await runner('/usr/bin/unzip', ['-Z1', archive], { timeout: 30000, maxOutput: 2000000 });
  const destination = join(root, 'verified');
  for (const name of listing.trim().split('\n')) {
    if (name.includes('\\') || name.split('/').includes('..') || !resolve(destination, name).startsWith(destination + sep)) throw new AppError('UPDATE_ARCHIVE', '安装包路径归属需要检查');
  }
  await runner('/usr/bin/ditto', ['-x', '-k', archive, destination], { timeout: 120000 });
  await assertExtracted(destination);
  const folder = (await readdir(destination)).find(name => name === '拾片-darwin-arm64');
  if (!folder) throw new AppError('UPDATE_ARCHIVE', '应用安装包结构需要检查');
  const application = join(destination, folder, '拾片.app');
  const info = join(application, 'Contents/Info.plist');
  const bundleId = await runner('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', info]);
  const version = await runner('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', info]);
  if (bundleId.trim() !== 'local.clipkeep.mac' || version.trim() !== release.version.replace(/^v/, '')) throw new AppError('UPDATE_IDENTITY', '应用标识或版本与发行记录需要重新核对');
  await runner('/usr/bin/lipo', ['-verify_arch', process.arch, join(application, 'Contents/MacOS/拾片')]);
  await runner('/usr/bin/codesign', ['--verify', '--deep', '--strict', application], { timeout: 120000 });
  await runner('/usr/sbin/spctl', ['--assess', '--type', 'execute', application], { timeout: 120000 });
  await runner('/usr/bin/xcrun', ['stapler', 'validate', application], { timeout: 120000 });
  return application;
}
