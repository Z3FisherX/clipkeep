// Development-only UI fixture. Served by ui-preview.mjs; never included in the App.
const scenario = new window.URLSearchParams(window.location.search).get('scenario') ?? 'ready';
const info = { id: 'abcdefghijk', platform: 'youtube', url: 'https://youtu.be/abcdefghijk', duration: 996,
  title: scenario === 'long' ? '一次关于工作、生活与创作的长谈：从清晨出发，记录那些值得被留下的普通时刻，与朋友一起回看这一整年的变化' : '2026年了，影视飓风是怎么工作的？',
  uploader: 'Mediastorm影视飓风', qualities: [{ id: '137', height: 1080, label: '1080p', hasAudio: false }, { id: '136', height: 720, label: '720p', hasAudio: false }], audioId: '140' };
let state = { inspecting: false, saveDirectory: '/Users/you/Downloads', mock: true,
  tools: ['yt-dlp', 'ffmpeg', 'ffprobe', 'node'].map(name => ({ name, ready: scenario !== 'missing' || name !== 'ffmpeg', version: '本地预览', path: `/local/tools/${name}` })) };
const listeners = new Set();
let timers = [];
let attempt = 0;
const snapshot = () => window.structuredClone(state);
const emit = () => listeners.forEach(listener => listener(snapshot()));
const ok = value => ({ ok: true, value });
const fail = (code, message) => ({ ok: false, error: { code, message } });
const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
const clearTimers = () => { timers.forEach(window.clearTimeout); timers = []; };
function runJob(input, reuse = false) {
  clearTimers(); attempt++;
  const directory = reuse ? state.job.directory : '/local/preview/独立任务';
  state.job = { id: `preview-${attempt}`, info, mode: input.mode, qualityId: input.qualityId, directory,
    status: 'running', phase: '下载媒体', percent: 0, detail: '正在连接…', outputs: [], attempt };
  emit();
  for (let step = 1; step <= 12; step++) timers.push(window.setTimeout(() => {
    if (scenario === 'error' && attempt === 1 && step === 5) {
      clearTimers(); state.job.status = 'failed'; state.job.phase = '下载未完成'; state.job.detail = '部分文件已保留';
      state.job.error = { code: 'NETWORK', message: '网络连接中断。请检查网络后重试，已下载的部分文件会保留。' }; emit(); return;
    }
    state.job.percent = Math.min(100, step * 9);
    state.job.detail = '8.6 MiB/s · 当前流剩余 00:12';
    if (step === 11) { state.job.phase = '校验文件'; state.job.detail = '正在检查文件时长与音视频轨'; }
    if (step === 12) {
      state.job.status = 'done'; state.job.phase = '已保存到本机'; state.job.detail = '文件时长、音视频轨及完整包扫描通过';
      state.job.outputs = input.mode === 'video' ? ['preview.mp4'] : input.mode === 'audio' ? ['preview.m4a'] : ['preview.mp4', 'preview.m4a'];
    }
    emit();
  }, step * 1400));
  return ok(snapshot().job);
}
window.desktop = {
  snapshot: async () => ok(snapshot()),
  checkTools: async () => { state.tools.forEach(tool => { tool.ready = true; }); emit(); return ok(state.tools); },
  onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  inspect: async ({ url, useBrowser }) => {
    if (useBrowser) return fail('TEST_AUTH', '界面预览不会访问登录态。');
    if (!/^https:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/)/.test(url)) return fail('INVALID_URL', '请粘贴单个有效的 HTTPS YouTube 视频链接，不支持频道或播放列表。');
    state.inspecting = true; emit(); await wait(900); if (!state.inspecting) return fail('CANCELLED', '已取消读取。');
    state.inspecting = false; emit();
    return scenario === 'auth' ? fail('BOT_CHECK', 'YouTube 要求登录以确认不是机器人。本次读取没有使用浏览器登录态。') : ok(info);
  },
  start: async input => runJob(input),
  retry: async () => runJob({ mode: state.job.mode, qualityId: state.job.qualityId }, true),
  cancel: async () => { clearTimers(); state.inspecting = false; if (state.job) { state.job.status = 'cancelled'; state.job.phase = '已取消'; state.job.detail = '临时文件已保留，可以重试。'; } emit(); return ok(); },
  chooseDirectory: async () => { state.saveDirectory = '/Users/you/Movies/我的视频收藏'; emit(); return ok(state.saveDirectory); },
  openAccess: async () => ok(), clearAccess: async () => ok(),
  openFolder: async () => ok(), openVideo: async () => ok(),
};
