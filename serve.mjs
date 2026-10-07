import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function startServer({port=48626}={}) {
 if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('Invalid port');
 const root=await realpath(path.join(here,'dist'));
 const names=JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8'));
 const assets=new Map();
 for(const name of names){
  if(typeof name!=='string'||!/^[-a-zA-Z0-9_.]+$/.test(name))throw Error('Invalid built asset');
  const resolved=await realpath(path.join(root,name));if(path.dirname(resolved)!==root)throw Error('Asset escapes dist');
  assets.set('/'+name,resolved);
 }
 assets.set('/',assets.get('/index.html'));
 const server=createServer(async(req,res)=>{
  const deny=(status)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}).end('Request refused');};
  if(req.method!=='GET'&&req.method!=='HEAD')return deny(405);
  const origin=`http://127.0.0.1:${server.address().port}`;
  if(req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return deny(403);
  const file=assets.get(req.url);if(!file)return deny(404);
  try{
   // Recheck the exact asset at each read, rejecting changed symlinks.
   if(await realpath(file)!==file)return deny(403);
   const body=await readFile(file);const ext=path.extname(file);
   res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'})[ext]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:body);
  }catch{deny(404);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startServer().then(s=>console.log(`FigurePreflight: ${s.url}`)).catch(e=>{console.error(e.message);process.exitCode=1;});
