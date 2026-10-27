import { mkdtemp, stat, statfs, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AccessInput, Job, Snapshot, StartInput, ToolInfo, VideoInfo } from '../shared/contracts';
import { AppError, friendlyError, sanitizeMetadata } from './validation';
import { resolveSource, type RedirectProbe } from './sources/redirects';
import type { VideoSource } from './sources/urls';
import { requireTools } from './tools';
import { baseArgs, sourceArgs } from './commands';
import { executeJob } from './pipeline';
import type { Runner } from './process';
import type { ResolveAccess } from './access/contracts';
import type { AccessSessionState } from '../shared/access';
export interface ServiceOptions {
  saveDirectory: string; mock: boolean; runner: Runner; detect: () => Promise<ToolInfo[]>;
  changed: (state: Snapshot) => void;
  redirectProbe?: RedirectProbe; resolveAccess?: ResolveAccess; accessSnapshot?: () => AccessSessionState[];
}
export class DownloadService {
  private job?: Job;
  private info?: VideoInfo;
  private source?: VideoSource;
  private originalSource?: VideoSource;
  private jobSource?: VideoSource;
  private sourceRunner?: Runner;
  private jobRunner?: Runner;
  private sessionRead = false;
  private tools: ToolInfo[] = [];
  private inspecting = false;
  private locked = false;
  private controller?: AbortController;
  private pending?: Promise<void>;
  private inspectPending?: Promise<VideoInfo>;
  constructor(private options: ServiceOptions) {}
  snapshot(): Snapshot {
    return { job: this.job, inspecting: this.inspecting, tools: this.tools,
      saveDirectory: this.options.saveDirectory, mock: this.options.mock, access: this.options.accessSnapshot?.() };
  }
  refreshAccess() { this.emit(); }
  reference() {
    const source = this.originalSource;
    if (!source || !this.info) throw new AppError('NO_INFO', '请先读取视频信息');
    return { identity: `${source.platform}:${source.id}:${source.part ?? this.info.videoIndex ?? 1}`,
      needsLink: source.platform === 'generic' || (source.platform === 'xiaohongshu' && source.url !== source.publicUrl)
        || (source.platform === 'vimeo' && new URL(source.url).searchParams.has('h')) };
  }
  async runPrepared(job: Job, useBrowser: boolean, localOnly = false, shouldCancel: () => boolean = () => false) {
    if (this.locked || this.inspecting || this.controller) throw new AppError('BUSY', '请等待当前操作完成收尾');
    this.job = job; this.jobSource = this.source; this.jobRunner = this.sourceRunner;
    const tools = requireTools(await this.checkTools());
    if (shouldCancel()) throw new AppError('CANCELLED', '任务已取消');
    if (localOnly) this.jobRunner = async (binary, args, options) => {
      if (binary.endsWith('yt-dlp') && args.includes('--')) throw new AppError('SOURCE_EXPIRED', '请重新准备来源以继续下载');
      return this.options.runner(binary, args, options);
    };
    this.launch(tools, useBrowser);
    await this.pending;
  }
  private emit() { this.options.changed(this.snapshot()); }
  get busy() { return this.locked || this.inspecting || ['running', 'cancelling'].includes(this.job?.status ?? ''); }
  private assertIdle() { if (this.busy) throw new AppError('BUSY', '已有操作正在进行，请等待完成或先取消。'); }
  async checkTools() { this.tools = await this.options.detect(); this.emit(); return this.tools; }
  async setDirectory(directory: string) {
    this.assertIdle();
    if (!(await stat(directory)).isDirectory()) throw new AppError('DIRECTORY', '请选择有效的保存目录。');
    await access(directory, constants.W_OK);
    this.options.saveDirectory = directory; this.emit();
    return directory;
  }
  async inspect(url: string, useBrowser: boolean, videoIndex?: number, access: Omit<AccessInput, 'useBrowser'> = {}) {
    this.assertIdle();
    this.inspecting = true; this.info = undefined; this.controller = new AbortController(); this.emit();
    this.source = undefined; this.sourceRunner = undefined; this.sessionRead = false;
    this.inspectPending = this.readInfo(url, useBrowser, this.controller.signal, videoIndex, access);
    try { this.info = await this.inspectPending; return this.info; }
    finally { this.inspecting = false; this.controller = undefined; this.emit(); }
  }
  private async readInfo(url: string, useBrowser: boolean, signal: AbortSignal, videoIndex: number | undefined, access: Omit<AccessInput, 'useBrowser'>) {
    const resolved = await resolveSource(url, signal, this.options.redirectProbe);
    const source = ['generic', 'weibo', 'twitter'].includes(resolved.platform) ? { ...resolved, part: videoIndex ?? resolved.part ?? 1 } : resolved;
    this.originalSource = source;
    this.assertAuthentication(source.platform, useBrowser, access.useSession);
    const tools = requireTools(await this.checkTools());
    if (access.candidateId && !access.useSession) throw new AppError('AUTH_SCOPE', '播放来源需要网页会话授权。');
    const context = access.useSession ? await this.options.resolveAccess?.(source, access.candidateId, signal) : undefined;
    if (access.useSession && !context) throw new AppError('SESSION_REQUIRED', '请打开网页登录窗口准备会话。');
    if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
    const request = context?.source ?? source;
    const runner = context?.runner ?? this.options.runner;
    const text = await this.readMetadata(request, tools, useBrowser, signal, runner);
    const parsed = sanitizeMetadata(JSON.parse(text), request.url, request);
    const info = context?.source ? { ...parsed, id: source.id, platform: source.platform, url: source.publicUrl,
      title: context.title ?? parsed.title, duration: parsed.duration ?? context.duration, captured: true, videoIndex: undefined, videoCount: undefined } : parsed;
    if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
    this.source = request; this.sourceRunner = runner; this.sessionRead = !!access.useSession;
    return info;
  }
  private async readMetadata(source: VideoSource, tools: ReturnType<typeof requireTools>, useBrowser: boolean, signal: AbortSignal, runner: Runner) {
    try {
      return await runner(tools.ytdlp,
        [...baseArgs(tools, useBrowser), ...sourceArgs(source.platform, source.part), '--dump-single-json', '--skip-download', '--no-warnings', '--', source.url],
        { signal, timeout: 90_000, platform: source.platform });
    } catch (error) {
      if (source.platform === 'xiaohongshu' && !new URL(source.url).searchParams.has('xsec_token')
        && error instanceof AppError && ['SITE_CHANGED', 'UNAVAILABLE'].includes(error.code))
        throw new AppError('SHARE_LINK_REQUIRED', '小红书需要完整分享参数。请粘贴小红书「分享 → 复制链接」得到的完整链接或分享文案。');
      throw error;
    }
  }
  async start(input: StartInput) {
    this.assertIdle();
    if (!this.info || !this.source) throw new AppError('NO_INFO', '请先读取视频信息。');
    this.assertAuthentication(this.info.platform, input.useBrowser, input.useSession);
    if (!!input.useSession !== this.sessionRead) throw new AppError('SESSION_REQUIRED', '访问方式已更新，请重新读取视频。');
    if (input.mode !== 'audio' && !this.info.qualities.some(q => q.id === input.qualityId))
      throw new AppError('FORMAT', '请选择可用清晰度。');
    if (input.mode === 'audio' && !this.info.audioId) throw new AppError('FORMAT', '这条视频提供画面，可选择视频 MP4 保存。');
    if (input.mode === 'both' && !this.info.audioId) throw new AppError('FORMAT', '这条视频提供画面，可选择视频 MP4 保存。');
    this.locked = true;
    try {
      const tools = requireTools(await this.checkTools());
      const disk = await statfs(this.options.saveDirectory);
      if (disk.bavail * disk.bsize < 256 * 1024 ** 2) throw new AppError('ENOSPC', '保存目录可用空间不足 256 MB，请先释放空间。');
      const directory = await mkdtemp(join(this.options.saveDirectory, `拾片-${this.info.id}-`));
      this.jobSource = this.source; this.jobRunner = this.sourceRunner;
      this.job = { id: randomUUID(), info: this.info, mode: input.mode, qualityId: input.qualityId,
        directory, accessMode: this.sessionRead ? 'session' : input.useBrowser ? 'browser' : 'public', status: 'running', phase: '准备下载', percent: 0, detail: '建立本地任务', outputs: [], attempt: 1 };
      this.launch(tools, input.useBrowser);
      return this.job;
    } finally { this.locked = false; }
  }
  async retry(useBrowser: boolean) {
    this.assertIdle();
    if (!this.job || !['failed', 'cancelled'].includes(this.job.status)) throw new AppError('RETRY', '没有可以重试的任务。');
    this.assertAuthentication(this.job.info.platform, useBrowser, this.job.accessMode === 'session');
    this.locked = true;
    try {
      const tools = requireTools(await this.checkTools());
      Object.assign(this.job, { status: 'running', phase: '准备重试', percent: 0, detail: '复用已有文件',
        error: undefined, attempt: this.job.attempt + 1 });
      this.launch(tools, useBrowser); return this.job;
    } finally { this.locked = false; }
  }
  private launch(tools: ReturnType<typeof requireTools>, useBrowser: boolean) {
    const job = this.job!;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const update = (patch: Partial<Job>) => { Object.assign(job, patch); this.emit(); };
    this.emit();
    this.pending = executeJob(job, tools, this.jobRunner ?? this.options.runner, signal, useBrowser, update, this.jobSource?.url)
      .then(() => update({ status: 'done', phase: '已保存到本机', percent: 100, detail: '文件时长、音视频轨及完整包扫描通过' }))
      .catch((error: unknown) => {
        const fault = friendlyError(error);
        update({ status: signal.aborted ? 'cancelled' : 'failed', phase: signal.aborted ? '已取消' : '未完成',
          error: fault, detail: '临时文件与已完成的成果均已保留' });
      }).finally(() => { this.controller = undefined; });
  }
  async cancel() {
    if (!this.controller) return;
    if (this.job?.status === 'running') this.job.status = 'cancelling';
    this.controller.abort(); this.emit();
    await Promise.allSettled([this.pending, this.inspectPending]);
  }
  private assertAuthentication(platform: VideoInfo['platform'], useBrowser: boolean, useSession = false) {
    if (useBrowser && useSession) throw new AppError('AUTH_SCOPE', '请选择一种视频访问方式。');
    if (platform === 'generic' && useBrowser) throw new AppError('AUTH_SCOPE', '通用网页使用公开访问模式。登录授权用于已接入的视频平台。');
  }
}
