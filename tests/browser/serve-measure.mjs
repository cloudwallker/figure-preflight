// Independent measurement harness, not the future application/server.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const routes=new Map(['/input.js','/measure.js','/font.js','/rules.js'].map(p=>[p,'src'+p.replace('.js','.ts')]));
routes.set('/api.js','tests/browser/measure-api.ts');
createServer(async(req,res)=>{try{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(await readFile('tests/browser/measure-harness.html'));return;}
 if(routes.has(req.url)){const r=await build({entryPoints:[routes.get(req.url)],bundle:true,write:false,format:'esm',logLevel:'silent'});res.setHeader('Content-Type','text/javascript');res.end(r.outputFiles[0].text);return;}
 if(req.url==='/font-assets.json'){res.setHeader('Content-Type','application/json');res.end(await readFile('assets/font-assets.json'));return;}
 res.writeHead(404).end();
}catch{res.writeHead(404).end('Module not implemented');}}).listen(48616,'127.0.0.1');
