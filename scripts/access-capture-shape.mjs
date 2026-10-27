import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.CLIPKEEP_TEST_MODE;
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('evidence/access-recovery-20261023/capture-shape-user-data')}`],env});
try {
  const page=await app.firstWindow();await page.waitForLoadState('networkidle');
  await page.getByLabel('视频链接').fill('https://www.douyin.com/video/7696307124208422159');
  await page.getByRole('button',{name:'打开网页登录',exact:true}).click();
  let remote;
  for(let index=0;index<100;index++){remote=app.windows().find(value=>value.url().startsWith('https://www.douyin.com/'));if(remote)break;await new Promise(resolve=>setTimeout(resolve,200));}
  const responses=[];
  remote.on('response',response=>{const url=new globalThis.URL(response.url());if(/douyinvod|zjcdn/.test(url.hostname))responses.push({host:url.hostname,type:response.headers()['content-type']});});
  await remote.waitForFunction(()=>[...window.document.querySelectorAll('video')].some(value=>value.readyState>=2),undefined,{timeout:60_000});
  const shape=await remote.evaluate(()=>{
    const groups=[];
    return window.performance.getEntriesByType('resource').filter(value=>/douyinvod|zjcdn/.test(new globalThis.URL(value.name).hostname)).map(value=>{
      const url=new globalThis.URL(value.name),group=url.searchParams.get('video_id'); if(group&&!groups.includes(group))groups.push(group);
      return {host:url.hostname,keys:[...url.searchParams.keys()],group:group?groups.indexOf(group):undefined,
        hints:Object.fromEntries(['mime_type','media_type','codec_type','format','ratio','quality_type'].map(name=>[name,url.searchParams.get(name)]))};
    });
  });
  await app.windows().find(value=>value.url()==='app://clipkeep/access.html').getByRole('button',{name:'使用此会话',exact:true}).click();
  const urls=await remote.evaluate(()=>[...new Set(window.performance.getEntriesByType('resource').map(value=>value.name).filter(value=>/douyinvod|zjcdn/.test(new globalThis.URL(value).hostname)))].slice(0,3));
  const probes=await app.evaluate(async ({webContents},urls)=>{
    const page=webContents.getAllWebContents().find(value=>value.getURL().startsWith('https://www.douyin.com/'));
    const out=[];
    for(const url of urls) for(const extra of [false,true]) {
      const controller=new globalThis.AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try {
        const response=await page.session.fetch(url,{credentials:'include',headers:{Range:'bytes=0-524287',...(extra?{'User-Agent':page.session.getUserAgent(),Referer:'https://www.douyin.com/'}:{})},signal:controller.signal});
        const reader=response.body.getReader(),chunks=[];let count=0;
        while(count<524288){const value=await reader.read();if(value.done)break;const chunk=Buffer.from(value.value).subarray(0,524288-count);chunks.push(chunk);count+=chunk.length;}
        await reader.cancel().catch(()=>{});const bytes=Buffer.concat(chunks),offset=bytes.indexOf('hdlr');
        out.push({extra,status:response.status,bytes:count,box:bytes.toString('ascii',4,8),handler:offset>=0?bytes.toString('ascii',offset+12,offset+16):undefined});
      }catch(error){out.push({extra,error:error.name,message:error.message.replace(/https?:\/\/[^\s]+/g,'[url]')});}
      finally{clearTimeout(timer);controller.abort();}
    }
    return out;
  },urls);
  await writeFile('evidence/access-recovery-20261023/douyin-probe-minimal.json',JSON.stringify(probes,null,2));
  await writeFile('evidence/access-recovery-20261023/douyin-stream-shape.json',JSON.stringify({responses,shape},null,2));
  console.log(JSON.stringify({count:shape.length,responses}));
} finally {await app.close();}
