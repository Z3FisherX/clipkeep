import { copyFile, mkdir, readFile, rename, writeFile, access, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ReleaseInfo, ToolName } from '../../shared/maintenance';
import { AppError } from '../errors';
import { verifyTool } from '../tools';
import type { Runner } from '../process';
import { downloadVerified } from './download';
const pathsSchema = z.partialRecord(z.enum(['yt-dlp', 'ffmpeg', 'ffprobe', 'node']), z.string());
export class ToolSetup {
  paths: Partial<Record<ToolName, string>> = {};
  candidate?: ReleaseInfo;
  applicationCandidate?: ReleaseInfo;
  private locked = false;
  get busy() { return this.locked; }
  constructor(readonly root: string, private runner: Runner, private resolveParser?: () => Promise<string | undefined>) {}
  async load() { this.paths = pathsSchema.parse(JSON.parse(await readFile(join(this.root, 'tool-paths.json'), 'utf8').catch(() => '{}'))); }
  async managed() {
    const path = join(this.root, 'tools/current/yt-dlp');
    return await access(path).then(() => path, () => undefined);
  }
  async rollbackAvailable() { return access(join(this.root, 'tools/previous/yt-dlp')).then(() => true, () => false); }
  async select(name: ToolName, path: string) {
    const tool = await verifyTool(name, path, this.runner);
    if (!tool.ready) throw new AppError('TOOL_VERSION', `${name} 校验需要处理：${tool.issue ?? '启动权限或架构'}`);
    const paths = { ...this.paths, [name]: path };
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = join(this.root, `tool-paths.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(paths), { mode: 0o600 });
    await rename(temporary, join(this.root, 'tool-paths.json')); this.paths = paths;
  }
  async upgrade() {
    const candidate = this.candidate;
    if (!candidate?.sha256 || !candidate.assetUrl) throw new AppError('UPDATE_CHECKSUM', '请先检查解析工具版本与校验清单');
    return this.withLock(async () => {
      const bytes = await downloadVerified(candidate.assetUrl!, candidate.sha256!);
      const staged = join(this.root, 'tools', `staged-${randomUUID()}`);
      await mkdir(staged, { recursive: true, mode: 0o700 });
      const binary = join(staged, 'yt-dlp'); await writeFile(binary, bytes, { mode: 0o755 });
      const tool = await verifyTool('yt-dlp', binary, this.runner);
      if (!tool.ready || tool.version !== candidate.version) throw new AppError('TOOL_VERSION', '解析器版本或运行架构校验需要重试');
      await this.preserveCurrent();
      const previousManaged = await this.managed(), saved = join(staged, 'previous-managed');
      if (previousManaged) await copyFile(previousManaged, saved);
      await mkdir(join(this.root, 'tools/current'), { recursive: true, mode: 0o700 });
      const current = join(this.root, 'tools/current/yt-dlp');
      await rename(binary, current);
      try { await this.select('yt-dlp', current); }
      catch (error) {
        if (previousManaged) { await copyFile(saved, current + '.restore'); await rename(current + '.restore', current); }
        else await unlink(current);
        throw error;
      }
    });
  }
  async rollback() {
    return this.withLock(async () => {
      const previous = join(this.root, 'tools/previous/yt-dlp');
      const tool = await verifyTool('yt-dlp', previous, this.runner);
      if (!tool.ready) throw new AppError('TOOL_VERSION', '回退版本需要重新校验');
      const current = join(this.root, 'tools/current/yt-dlp');
      const temporary = current + '.rollback';
      await copyFile(previous, temporary); await rename(temporary, current);
      await this.select('yt-dlp', current);
    });
  }
  private async preserveCurrent() {
    const current = this.paths['yt-dlp'] ?? await this.managed() ?? await this.resolveParser?.();
    if (!current) throw new AppError('TOOL_MISSING', '请准备可用的解析工具后升级');
    const original = await verifyTool('yt-dlp', current, this.runner);
    if (!original.ready) throw new AppError('TOOL_VERSION', '升级前的解析工具需要运行校验');
    const previous = join(this.root, 'tools/previous');
    await mkdir(previous, { recursive: true, mode: 0o700 });
    const temporary = join(previous, `yt-dlp-${randomUUID()}`);
    await copyFile(current, temporary);
    const copy = await verifyTool('yt-dlp', temporary, this.runner);
    if (!copy.ready || copy.version !== original.version) throw new AppError('TOOL_VERSION', '回退副本需要重新校验');
    await rename(temporary, join(previous, 'yt-dlp'));
  }
  async withLock<T>(operation: () => Promise<T>) {
    if (this.locked) throw new AppError('BUSY', '工具维护正在进行');
    this.locked = true;
    try { return await operation(); } finally { this.locked = false; }
  }
}
