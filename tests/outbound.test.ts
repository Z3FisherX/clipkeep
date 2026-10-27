import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { createConnection } from 'node:net';
import { outboundFromRule } from '../electron/network/outbound';
import { startPublicProxy } from '../electron/network/public-proxy';
import { systemProxyFactory } from '../electron/network/system-proxy';
import { blockedAddress } from '../electron/network/public-address';
async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const value=server.address(); if(!value || typeof value==='string')throw new Error('No port');return value.port;
}
test('system proxy selection preserves configured route ordering and validates its protocol', async () => {
  assert.deepEqual(outboundFromRule('PROXY localhost:13190; DIRECT'),{host:'localhost',port:13190});
  assert.equal(outboundFromRule('DIRECT; PROXY localhost:13190'),undefined);
  assert.deepEqual(outboundFromRule('PROXY [::1]:3128'),{host:'::1',port:3128});
  assert.throws(()=>outboundFromRule('SOCKS 127.0.0.1:1080'),{code:'PROXY_PROTOCOL'});
  assert.throws(()=>outboundFromRule('PROXY localhost:70000'),{code:'PROXY_PROTOCOL'});
  let target=''; const create=systemProxyFactory({resolveProxy:async url=>{target=url;return 'DIRECT';}});
  const proxy=await create('https://vimeo.com/123');assert.equal(target,'https://vimeo.com/123');await proxy.close();
});
test('outbound system proxy receives a pinned public IP while the target receives its original Host', async () => {
  const tunnels:string[]=[];
  const media=createServer((req,res)=>res.end(JSON.stringify({host:req.headers.host,authorization:!!req.headers['proxy-authorization']})));
  const mediaPort=await listen(media);
  const upstream=createServer();
  upstream.on('connect',(req,client,head)=>{
    tunnels.push(req.url??'');const socket=createConnection({host:'127.0.0.1',port:mediaPort},()=>{
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)socket.write(head);client.pipe(socket);socket.pipe(client);
    });
    client.on('error',()=>socket.destroy());socket.on('error',()=>client.destroy());
    client.on('close',()=>socket.destroy());socket.on('close',()=>client.destroy());
  });
  const upstreamPort=await listen(upstream);
  const proxy=await startPublicProxy({outbound:{host:'127.0.0.1',port:upstreamPort},resolveAddress:async host=>{
    if(host==='127.0.0.1')throw blockedAddress(); return {address:'93.184.216.34',family:4};
  }});
  const endpoint=new URL(proxy.url);
  const send=(target:string)=>new Promise<{status:number;body:string}>((resolve,reject)=>{
    const call=request({host:endpoint.hostname,port:endpoint.port,path:target,
      headers:{'Proxy-Authorization':`Basic ${Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')}`}},res=>{
      let body='';res.on('data',data=>{body+=data.toString();});res.on('end',()=>resolve({status:res.statusCode??0,body}));
    });call.on('error',reject);call.end();
  });
  try {
    const result=await send('http://media.example.com/movie.mp4');assert.equal(result.status,200);
    assert.deepEqual(JSON.parse(result.body),{host:'media.example.com',authorization:false});
    assert.equal((await send('http://127.0.0.1/private')).status,403);
    await new Promise<void>((resolve,reject)=>{
      const call=request({host:endpoint.hostname,port:endpoint.port,method:'CONNECT',path:'media.example.com:443',
        headers:{'Proxy-Authorization':`Basic ${Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')}`}});
      call.on('error',reject);call.on('connect',(response,socket)=>{
        assert.equal(response.statusCode,200);let body='';
        socket.on('data',data=>{body+=data.toString();if(body.includes('authorization')){socket.destroy();resolve();}});
        socket.on('error',reject);socket.write('GET / HTTP/1.1\r\nHost: media.example.com\r\nConnection: close\r\n\r\n');
      });call.end();
    });
    assert.deepEqual(tunnels,['93.184.216.34:80','93.184.216.34:443']);
  } finally {await proxy.close();await Promise.all([media,upstream].map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));}
});
