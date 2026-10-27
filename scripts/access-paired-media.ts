import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { run } from '../electron/process';
import { startPublicProxy } from '../electron/network/public-proxy';
import { createNetworkRunner } from '../electron/network/runner';
import { createSessionRunner } from '../electron/access/runner';
import { createMediaRunner, capturedMetadata } from '../electron/access/media-runner';
import { mp4Role } from '../electron/access/media-probe';
import { parseSource } from '../electron/sources/urls';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { executeJob } from '../electron/pipeline';
import type { Job } from '../shared/contracts';
const root = await mkdtemp(resolve('evidence/runtime-access-paired-'));
const tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
await run(tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-n','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=2',
  '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',join(root,'video.mp4')]);
await run(tools.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-n','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
  '-c:a','aac','-movflags','+faststart',join(root,'audio.m4a')]);
const videoBytes=await readFile(join(root,'video.mp4')),audioBytes=await readFile(join(root,'audio.m4a'));
assert.equal(mp4Role(videoBytes),'video');assert.equal(mp4Role(audioBytes),'audio');
const requests:{path:string;cookie:boolean}[]=[];
const server=createServer((request,response)=>{
  requests.push({path:request.url??'',cookie:request.headers.cookie?.includes('synthetic-session')??false});
  const audio=request.url==='/audio.mp4',bytes=audio?audioBytes:videoBytes;
  response.writeHead(200,{'Content-Type':'video/mp4','Content-Length':bytes.length}).end(bytes);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw new Error('No local port');
const base={kind:'mp4' as const,host:'media.example.com',label:'captured',createdAt:Date.now(),pageId:'video'};
const selected={...base,id:'video',url:'http://media.example.com/video.mp4',role:'video' as const};
const audio={...base,id:'audio',url:'http://media.example.com/audio.mp4',role:'audio' as const};
const media={selected,audio,id:'captured-pair',title:'独立画面与音轨',duration:2};
const runner=createMediaRunner(createSessionRunner(createNetworkRunner(run,()=>startPublicProxy({
  resolveAddress:async()=>({address:'93.184.216.34',family:4}),connect:()=>createConnection({host:'127.0.0.1',port:address.port}),
})),{active:()=>true,cookies:async()=>[{name:'session',value:'synthetic-session',domain:'media.example.com',path:'/',secure:false}],
  userAgent:'Fixture Agent',referer:'https://www.douyin.com/video/7696307124208422159',targets:[selected.url,audio.url]}),media);
try {
  const source={...parseSource('https://media.example.com/video.mp4'),url:selected.url};
  const info={...sanitizeMetadata(capturedMetadata(media),selected.url,source),captured:true,platform:'douyin' as const};
  const outcomes=[];
  for(const mode of ['both','audio'] as const){
    const directory=await mkdtemp(join(root,`${mode}-`));
    const job:Job={id:mode,info,mode,qualityId:info.qualities[0].id,directory,status:'running',phase:'',percent:0,detail:'',outputs:[],attempt:1};
    await executeJob(job,tools,runner,new AbortController().signal,false,patch=>Object.assign(job,patch),selected.url);
    assert.equal(job.outputs.length,mode==='both'?2:1);outcomes.push({mode,outputs:job.outputs});
  }
  assert.ok(requests.every(value=>value.cookie));
  assert.equal(requests.filter(value=>value.path==='/video.mp4').length,1);
  assert.equal(requests.filter(value=>value.path==='/audio.mp4').length,2);
  await writeFile('evidence/access-recovery-20261023/paired-media-results.json',JSON.stringify({passed:true,root,outcomes,requests,date:new Date().toISOString()},null,2));
  console.log(JSON.stringify({passed:true,outcomes,requests}));
} finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
