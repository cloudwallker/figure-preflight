import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const built=await build({entryPoints:['src/input.ts','src/units.ts','src/model.ts','src/font.ts','src/measure.ts','src/rules.ts','src/app.ts','src/preview.ts','src/report.ts'],outdir:'dist',bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome120','firefox120'],sourcemap:false,metafile:true});
const replay=await build({entryPoints:['src/report.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome120','firefox120'],sourcemap:false});
const css=await readFile('app.css','utf8'),font=JSON.parse(await readFile('assets/font-assets.json','utf8'));
await writeFile('dist/trusted-assets.json',JSON.stringify({appJs:replay.outputFiles[0].text,css,font}));
await copyFile('index.html','dist/index.html');await copyFile('app.css','dist/app.css');await copyFile('fixtures/01-bad.svg','dist/bad.svg');
await writeFile('dist/asset-manifest.json',JSON.stringify([...Object.keys(built.metafile.outputs).map(p=>p.replace(/^dist\//,'')),'index.html','app.css','trusted-assets.json','bad.svg']));
