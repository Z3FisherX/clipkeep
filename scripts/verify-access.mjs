import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { verifyMedia } from '../electron/media.ts';
import { run } from '../electron/process.ts';
const directory='evidence/access-recovery-20261023';
const twitter=JSON.parse(await readFile(`${directory}/twitter-save.json`,'utf8'));
const douyin=JSON.parse(await readFile(`${directory}/douyin-save.json`,'utf8'));
assert.equal(twitter.outcome,'done');assert.equal(douyin.status,'done');
const sources=[{platform:'twitter',id:twitter.videoId,duration:twitter.duration,outputs:twitter.outputs},
  {platform:'douyin',id:douyin.info.id,duration:douyin.info.duration,outputs:douyin.outputs}];
const outcomes=[];
for(const source of sources){
  assert.equal(source.outputs.length,2);const files=[];
  for(const path of source.outputs){
    assert.ok(['.mp4','.m4a'].includes(extname(path)));
    await verifyMedia(path,source.duration,path.endsWith('.mp4'),'/opt/homebrew/bin/ffprobe',run,new globalThis.AbortController().signal);
    const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
    files.push({path,bytes:(await stat(path)).size,sha256:hash.digest('hex')});
  }
  outcomes.push({platform:source.platform,id:source.id,expectedDuration:source.duration,files});
}
await writeFile(`${directory}/online-file-verification.json`,JSON.stringify({passed:true,date:new Date().toISOString(),outcomes,
  checks:['H.264 + AAC video','AAC audio','complete packet scan','source duration within 3 seconds','file content SHA-256']},null,2));
console.log(JSON.stringify({passed:true,platforms:outcomes.map(value=>value.platform),files:outcomes.reduce((sum,value)=>sum+value.files.length,0)}));
