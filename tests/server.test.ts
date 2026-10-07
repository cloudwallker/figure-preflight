import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
test('production server binds loopback and refuses cross-origin, traversal, query and write requests',async()=>{
 const api=await import('../serve.mjs').catch(()=>null);assert.ok(api,'production server must exist');
 const server=await api.startServer({port:0});assert.match(server.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const get=(path:string,method='GET',headers:Record<string,string>={})=>new Promise<{status:number,headers:http.IncomingHttpHeaders,body:string}>((resolve,reject)=>{const req=http.request(server.url+path,{method,headers},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));});req.on('error',reject);req.end();});
 try{for(const path of ['/../package.json','/%2e%2e/package.json','/src/input.ts','/?file=package.json','/assets/../package.json','/C:/Windows/win.ini'])assert.notEqual((await get(path)).status,200,path);
 assert.equal((await get('/','POST')).status,405);assert.equal((await get('/','GET',{Origin:'https://other.example'})).status,403);
 assert.equal((await get('/','GET',{'Sec-Fetch-Site':'cross-site'})).status,403);assert.equal((await get('/','GET',{Host:'evil.example'})).status,403);
 const page=await get('/');assert.equal(page.status,200);assert.match(page.body,/FigurePreflight/);assert.equal(page.headers['access-control-allow-origin'],undefined);assert.match(page.headers['content-security-policy'] as string,/connect-src 'self'/);
 }finally{await server.close();}
});
