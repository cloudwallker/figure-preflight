// Test harness only. Loads current real modules; never serves the future app.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const server=createServer(async(req,res)=>{
 try {
  if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end(await readFile('tests/browser/input-harness.html'));return;}
  if(req.url==='/input.js') {const r=await build({entryPoints:['src/input.ts'],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});res.setHeader('Content-Type','text/javascript');res.end(r.outputFiles[0].text);return;}
  if(req.url==='/hash.js') {const r=await build({entryPoints:['src/sha256.ts'],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});res.setHeader('Content-Type','text/javascript');res.end(r.outputFiles[0].text);return;}
  res.writeHead(404).end();
 }catch{res.writeHead(404).end('Module not implemented');}
});
server.listen(48606,'127.0.0.1');
