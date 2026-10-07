import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {startServer} from '../../serve.mjs';
await startServer({port:48626});
createServer(async(req,res)=>{try{
 if(req.url==='/app'){res.writeHead(302,{Location:'http://127.0.0.1:48626/'}).end();return;}
 if(req.url==='/app.js'){const r=await build({entryPoints:['src/app.ts'],bundle:true,write:false,format:'esm',logLevel:'silent'});res.setHeader('Content-Type','text/javascript');res.end(r.outputFiles[0].text);return;}
 if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(await readFile('app.css'));return;}
 if(req.url==='/trusted-assets.json'){res.setHeader('Content-Type','application/json');res.end(await readFile('dist/trusted-assets.json'));return;}
 if(req.url==='/bad.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('fixtures/01-bad.svg'));return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}#previews{display:flex;gap:0}</style><div id="stage"></div><div id="previews"></div><script type="module">try{window.api=await import("/api.js")}catch{window.api={}}window.ready=true;</script>');return;}
 if(req.url==='/api.js'){const r=await build({entryPoints:['tests/browser/delivery-api.ts'],bundle:true,write:false,format:'esm',logLevel:'silent'});res.setHeader('Content-Type','text/javascript');res.end(r.outputFiles[0].text);return;}
 if(req.url==='/font-assets.json'){res.setHeader('Content-Type','application/json');res.end(await readFile('assets/font-assets.json'));return;}
 res.writeHead(404).end();
}catch{res.writeHead(404).end('Delivery module not implemented');}}).listen(48636,'127.0.0.1');
