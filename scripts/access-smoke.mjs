import { startDownload } from './ui-download.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = await mkdtemp(resolve('evidence/runtime-access-ui-'));
const destination = 'evidence/queue-implementation-20261023';
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i',
  'testsrc2=size=360x640:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', join(root,'fixture.mp4'), '-vn','-c:a','copy',join(root,'fixture.m4a')]);
await writeFile(join(root,'access-fixture'),'fixture');
const env = {...process.env,CLIPKEEP_TEST_MODE:'1',CLIPKEEP_TEST_ROOT:root}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({args:['.'],env});
const watchdog = setTimeout(()=>app.process().kill('SIGKILL'),180_000);
const checks = [], errors = [];
let page;
const snapshot = async () => { const value = await page.evaluate(()=>window.desktop.snapshot()); assert.equal(value.ok,true); return value.value; };
async function waitJob(status) {
  for(let index=0;index<200;index++) { const job=(await snapshot()).job;
    if(job?.status===status)return job;
    if(job?.status==='failed' && status==='done')assert.fail(JSON.stringify(job.error));
    await new Promise(resolve=>setTimeout(resolve,100)); }
  assert.fail(`Expected ${status}`);
}
async function inspectSession(url, id) {
  return page.evaluate(input=>window.desktop.inspect(input),{url,useBrowser:false,useSession:true,candidateId:id});
}
try {
  page=await app.firstWindow(); page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(async ()=>(await window.desktop.snapshot()).value.tools.length===4);
  await page.getByText('登录与访问', { exact: true }).click();
  const scenarios=[{platform:'douyin',url:'分享 https://v.douyin.com/example/'},
    {platform:'vimeo',url:'https://vimeo.com/76979871'}, {platform:'twitter',url:'https://x.com/i/web/status/2113610514878124413'}];
  for(const item of scenarios) {
    await page.getByLabel('视频链接').fill(item.url);
    const pending=await inspectSession(item.url); assert.equal(pending.error.code,'SESSION_REQUIRED');
    await page.getByRole('button',{name:'打开网页登录',exact:true}).click();
    const toolbar=app.windows().find(value=>value.url()==='app://clipkeep/access.html')??await app.waitForEvent('window',{predicate:value=>value.url()==='app://clipkeep/access.html'});
    const local=toolbar??app.windows().find(value=>value.url()==='app://clipkeep/access.html'); assert.ok(local);
    await local.getByRole('button',{name:'使用此会话',exact:true}).waitFor();
    await page.waitForFunction(platform=>(window.desktop.snapshot().then(value=>value.value.access?.find(item=>item.platform===platform)?.candidates.length>0)),item.platform);
    assert.equal((await inspectSession(item.url)).error.code,'SESSION_REQUIRED');
    const remote=app.windows().find(value=>value.url().startsWith('https://')); assert.ok(remote);
    assert.deepEqual(await remote.evaluate(()=>({desktop:typeof window.desktop,access:typeof window.accessWindow,require:typeof window.require,process:typeof window.process})),
      {desktop:'undefined',access:'undefined',require:'undefined',process:'undefined'});
    const preferences=await app.evaluate(({webContents})=>webContents.getAllWebContents().filter(value=>value.getURL().startsWith('https://')).map(value=>({
      sandbox:value.getLastWebPreferences().sandbox,node:value.getLastWebPreferences().nodeIntegration,isolation:value.getLastWebPreferences().contextIsolation,persist:value.session.isPersistent()})));
    assert.ok(preferences.every(value=>value.sandbox && !value.node && value.isolation && !value.persist));
    await local.getByRole('button',{name:'使用此会话',exact:true}).click();
    await page.getByRole('button',{name:'使用网页会话读取',exact:true}).click();
    await page.waitForFunction(()=>window.document.querySelector('.video-preview') || [...window.document.querySelectorAll('h2')].some(value=>value.textContent.includes('本地测试影片')));
    await page.getByRole('button',{name:/MP4 来源 1/}).click();
    await page.getByRole('heading',{name:'网页登录测试影片',exact:true}).waitFor();
    const serialized=JSON.stringify(await snapshot()); assert.equal(serialized.includes('fixture-private'),false);
    await page.screenshot({path:`${destination}/ui-${item.platform}-session.png`,fullPage:true,animations:'disabled'});
    const modes=item.platform==='douyin'?[['both','视频 + 音频 MP4 + M4A'],['audio','纯音频 M4A'],['video','带声视频 MP4']]:[['both','视频 + 音频 MP4 + M4A']];
    for(const [mode,label] of modes){
      await page.getByRole('button',{name:label,exact:true}).click();
      await startDownload(page);
      await waitJob('running'); const job=await waitJob('done'); assert.equal(job.info.platform,item.platform); assert.equal(job.info.captured,true);
      assert.equal(job.accessMode,'session');assert.equal(job.outputs.length,mode==='both'?2:1);checks.push(`${item.platform} captured ${mode}`);
    }
    if(item.platform==='douyin') {
      const wrong=await inspectSession('https://www.douyin.com/video/7696307124208422159'); assert.equal(wrong.error.code,'SESSION_REQUIRED');
      await local.getByRole('button',{name:'打开登录页',exact:true}).click();
      await page.waitForTimeout(150);
      await local.getByRole('button',{name:'回到目标视频',exact:true}).click();
      await page.getByRole('button',{name:/MP4 来源 1/}).click();
      await page.getByRole('heading',{name:'网页登录测试影片',exact:true}).waitFor();
      checks.push('short share resolution and login navigation');
      await writeFile(join(root,'fail-download'),'fixture');
      await startDownload(page); await waitJob('running'); const attention=await waitJob('awaitingInput'); assert.equal(attention.error.code,'NETWORK');
      await unlink(join(root,'fail-download'));
      const retried=await page.evaluate(()=>window.desktop.retry({useBrowser:false})); assert.equal(retried.ok,true);
      await waitJob('running'); await waitJob('done'); checks.push('session retry');
      await local.getByRole('button',{name:'返回拾片',exact:true}).click();
      assert.equal((await snapshot()).access.find(value=>value.platform===item.platform).ready,true);
      await page.getByRole('button',{name:'打开网页登录',exact:true}).click();
      let candidateA;
      for(let index=0;index<100;index++) {
        candidateA=(await snapshot()).access.find(value=>value.platform==='douyin').candidates[0]?.id;
        if(candidateA)break; await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(candidateA);
      const readA=await inspectSession(item.url,candidateA); assert.equal(readA.ok,true);
      const queuedA=await page.evaluate(info=>window.desktop.enqueue({inspectionId:info.inspectionId,requestId:window.crypto.randomUUID(),mode:'video',qualityId:info.qualities[0].id,useBrowser:false,useSession:true,originalConfirmed:true,allowDuplicate:true}),readA.value);
      assert.equal(queuedA.ok,true); await page.evaluate(()=>window.desktop.taskAction({action:'run'})); await waitJob('running');
      const secondUrl='https://www.douyin.com/video/7696307124208422159';
      await page.getByLabel('视频链接',{exact:true}).fill(secondUrl);
      await page.getByRole('button',{name:'打开网页登录',exact:true}).click();
      let second;
      for(let index=0;index<100;index++) {
        second=(await snapshot()).access.find(value=>value.platform==='douyin');
        if(second?.publicUrl===secondUrl && second.candidates.length)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.equal(second.publicUrl,secondUrl); assert.ok(second.candidates.length);
      const readB=await inspectSession(secondUrl,second.candidates[0].id); assert.equal(readB.ok,true);
      const queuedB=await page.evaluate(info=>window.desktop.enqueue({inspectionId:info.inspectionId,requestId:window.crypto.randomUUID(),mode:'both',qualityId:info.qualities[0].id,useBrowser:false,useSession:true,originalConfirmed:true}),readB.value);
      assert.equal(queuedB.ok,true);
      for(let index=0;index<200;index++) {
        const state=await snapshot(); if(state.queue.paused && !state.queue.activeId)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const records=await page.evaluate(()=>window.desktop.history({}));
      for(const id of [queuedA.value.id,queuedB.value.id]) assert.equal(records.value.items.find(value=>value.id===id)?.status,'done');
      checks.push('same-platform A downloading while B is captured and queued');
    }
    await page.getByRole('button',{name:'清除网页会话',exact:true}).click();
    await page.waitForFunction(platform=>window.desktop.snapshot().then(value=>!value.value.access?.some(item=>item.platform===platform)),item.platform);
    assert.equal((await inspectSession(item.url)).error.code,'SESSION_REQUIRED');checks.push(`${item.platform} isolation consent clear`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${destination}/ui-session-results.json`,JSON.stringify({passed:true,root,checks,errors,date:new Date().toISOString()},null,2));
  console.log(JSON.stringify({passed:true,checks}));
} catch(error) { await page?.screenshot({path:`${destination}/ui-session-error.png`,fullPage:true}); await writeFile(`${destination}/ui-session-error.json`,JSON.stringify({state:await snapshot(),text:await page.locator('body').innerText()},null,2)); throw error;
} finally { await page?.evaluate(()=>window.desktop.cancel()).catch(()=>{});await app.close();clearTimeout(watchdog); }
