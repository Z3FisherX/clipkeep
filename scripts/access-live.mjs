import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.CLIPKEEP_TEST_MODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${resolve('evidence/access-recovery-20261023/live-user-data')}`], env });
try {
await app.evaluate(() => {
  const cp = process.getBuiltinModule('node:child_process'); const original = cp.spawn;
  globalThis.__clipkeepProcessDiagnostics = []; globalThis.__clipkeepMetadataShapes = [];
  cp.spawn = (...args) => {
    const child = original(...args); let stderr = '', stdout = '';
    child.stdout?.on('data', data => { if (args[1]?.includes('--dump-single-json')) stdout += data.toString(); });
    child.stderr?.on('data', data => { stderr += data.toString(); });
    child.on('close', code => { if (code === 0) {
      if (stdout) { try { const value = JSON.parse(stdout); globalThis.__clipkeepMetadataShapes.push({idLength:value.id?.length,titleLength:value.title?.length,
        types:Object.fromEntries(Object.entries(value).filter(([name])=>['id','title','duration','formats','uploader','creator','playlist_index','is_live','live_status'].includes(name)).map(([name,item])=>[name,Array.isArray(item)?'array':typeof item])),
        formatCount:value.formats?.length, formats:value.formats?.map(item=>({idLength:item.format_id?.length,protocol:item.protocol,height:item.height,vcodec:item.vcodec,acodec:item.acodec})) }); } catch { /* Keep source data in memory only. */ } } return; }
      globalThis.__clipkeepProcessDiagnostics.push({ code,
        trace: [...stderr.matchAll(/File "([^"]+)", line (\d+)/g)].map(value => ({module:value[1].split('/').at(-1),line:Number(value[2])})),
        classes: [...stderr.matchAll(/^(\w+(?:Error|Exception)):/gm)].map(value=>value[1]),
        errno: stderr.match(/Errno \d+/)?.[0],
        summary: stderr.replace(/https?:\/\/[^\s"']+/g, '[url]').replace(/"[^"]*"|'[^']*'/g, '[quoted]').replace(/[A-Za-z0-9_.%~-]{24,}/g, '[token]').slice(-1800),
        flags: ['Invalid syntax in Cookie Header','invalid length','Netscape','config','permission denied','bad file descriptor','not seekable','seek','Illegal seek','Read-only'].filter(value=>stderr.includes(value)),
      });
    }); return child;
  };
});
const page = await app.firstWindow();
await page.waitForLoadState('networkidle');
await page.getByLabel('视频链接').fill('https://www.douyin.com/video/7696307124208422159');
await page.getByRole('button', { name: '打开网页登录', exact: true }).click();
let remote;
for (let index=0; index<100; index++) { remote=app.windows().find(value => value.url().startsWith('https://www.douyin.com/')); if(remote)break; await new Promise(resolve=>setTimeout(resolve,200)); }
if(!remote)throw new Error('Access page was not created');
await remote.waitForFunction(() => [...window.document.querySelectorAll('video')].some(value => value.readyState >= 2), undefined, {timeout:60_000}).catch(()=>{});
const windows = app.windows();
await writeFile('evidence/access-recovery-20261023/live-window-state.json', JSON.stringify(await app.evaluate(({webContents}) => webContents.getAllWebContents().map(value => ({id:value.id,type:value.getType(),url:value.getURL(),title:value.getTitle(),destroyed:value.isDestroyed()}))),null,2));
console.log(JSON.stringify({windows:windows.length}));
await writeFile('evidence/access-recovery-20261023/douyin-page-state.json', JSON.stringify(await windows.find(value => value.url().startsWith('https://www.douyin.com/')).evaluate(() => ({title:window.document.title,text:window.document.body.innerText.slice(0,6000),videos:[...window.document.querySelectorAll('video')].map(value=>({playing:!value.paused,ready:value.readyState,duration:value.duration}))})),null,2));
await windows.find(value => value.url().startsWith('https://www.douyin.com/')).screenshot({path:'evidence/access-recovery-20261023/douyin-page.png'});
const toolbar = windows.find(value => value.url() === 'app://clipkeep/access.html');
await toolbar.getByRole('button',{name:'使用此会话',exact:true}).click();
await writeFile('evidence/access-recovery-20261023/douyin-cookie-shape.json',JSON.stringify(await app.evaluate(async ({webContents})=>{
 const view=webContents.getAllWebContents().find(value=>value.getURL().startsWith('https://www.douyin.com/'));
 const cookies=await view.session.cookies.get({url:view.getURL()});
 return cookies.map(cookie=>({nameLength:cookie.name.length,valueLength:cookie.value.length,invalidName:!/^[!#$%&'*+.^_`|~\w-]+$/.test(cookie.name),
 controls:['name','value','domain','path'].filter(key=>[...String(cookie[key]??'')].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))}));
}),null,2));

let result = await page.evaluate(() => window.desktop.inspect({url:'https://www.douyin.com/video/7696307124208422159',useBrowser:false,useSession:true}));
await writeFile('evidence/access-recovery-20261023/douyin-session-read.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({read:result.ok,code:result.error?.code}));
const access = await page.evaluate(() => window.desktop.snapshot());
await writeFile('evidence/access-recovery-20261023/douyin-access-state.json',JSON.stringify(access,null,2));
if (!result.ok) {
  const candidate=access.value.access.find(value=>value.platform==='douyin').candidates.find(value=>value.host.endsWith('.douyinvod.com') || value.host.endsWith('.zjcdn.com'));
  if(candidate)result=await page.evaluate(id=>window.desktop.inspect({url:'https://www.douyin.com/video/7696307124208422159',useBrowser:false,useSession:true,candidateId:id}),candidate.id);
  await writeFile('evidence/access-recovery-20261023/douyin-captured-read.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({capturedRead:result.ok,code:result.error?.code}));
  await writeFile('evidence/access-recovery-20261023/douyin-access-final-state.json',JSON.stringify(await page.evaluate(()=>window.desktop.snapshot()),null,2));
}
if (result.ok) {
  const q=result.value.qualities.find(value=>value.height<=1080)??result.value.qualities[0];
  const start=await page.evaluate(input=>window.desktop.start(input),{mode:!q?'audio':result.value.audioId?'both':'video',qualityId:q?.id,useBrowser:false,useSession:true});
  console.log(JSON.stringify({started:start.ok,code:start.error?.code}));
  for(let i=0;i<900;i++) {
    const state=await page.evaluate(()=>window.desktop.snapshot());
    if(['done','failed'].includes(state.value.job?.status)) {
      await writeFile('evidence/access-recovery-20261023/douyin-save.json',JSON.stringify(state.value.job,null,2));
      console.log(JSON.stringify({save:state.value.job.status,code:state.value.job.error?.code})); break;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}
await writeFile('evidence/access-recovery-20261023/douyin-metadata-shapes.json', JSON.stringify(await app.evaluate(()=>globalThis.__clipkeepMetadataShapes),null,2));
await writeFile('evidence/access-recovery-20261023/douyin-process-diagnostics.json', JSON.stringify(await app.evaluate(()=>globalThis.__clipkeepProcessDiagnostics),null,2));
await page.screenshot({path:'evidence/access-recovery-20261023/douyin-save-ui.png',fullPage:true});
await page.evaluate(()=>window.desktop.clearAccess({platform:'douyin'}));
} finally { await app.close(); }
