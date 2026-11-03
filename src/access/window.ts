import type {} from '../../shared/access';
import './window.css';
const get = (id: string) => document.getElementById(id)!;
async function refresh() {
  const reply = await window.accessWindow.state();
  if (!reply.ok) { get('message').textContent = reply.error.message; return; }
  get('origin').textContent = reply.value.origin;
  get('platform').textContent = `${reply.value.name} · 网页会话`;
  get('message').textContent = reply.value.loginOnly ? reply.value.message : `${reply.value.message} · 已识别 ${reply.value.candidateCount} 个播放来源`;
  get('login').textContent = reply.value.loginOnly ? '元宝登录页' : '打开登录页';
  get('reload').textContent = reply.value.loginOnly ? '刷新元宝页面' : '回到目标视频';
}
async function act(action: () => ReturnType<typeof window.accessWindow.authorize>) {
  const reply = await action();
  if (!reply.ok) get('message').textContent = reply.error.message;
  else await refresh();
}
get('login').addEventListener('click', () => { void act(() => window.accessWindow.login()); });
get('reload').addEventListener('click', () => { void act(() => window.accessWindow.reloadVideo()); });
get('authorize').addEventListener('click', () => { void act(() => window.accessWindow.authorize()); });
get('close').addEventListener('click', () => { void act(() => window.accessWindow.close()); });
void refresh(); setInterval(() => { void refresh(); }, 2000);
