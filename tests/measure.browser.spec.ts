import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import AjvModule from 'ajv';
const Ajv=(AjvModule as any).default??AjvModule,schema=JSON.parse(readFileSync('schemas/figure-report-v1.schema.json','utf8'));schema.$ref='#/definitions/MeasurementReport';
const validReport=new Ajv({strict:false,strictNumbers:true,allErrors:true}).compile(schema);
const checkReport=(r:any)=>{expect(validReport(r),JSON.stringify(validReport.errors)).toBe(true);for(const kind of ['text','stroke']){const c=r.coverage[kind];expect(c.discovered).toBe(c.measured+c.unassessed+c.excluded+c.pending);for(const status of ['measured','unassessed','excluded'])expect(c[status]).toBe(r.objects.filter((o:any)=>o.kind===kind&&o.status===status).length);}};
const svg=(body:string,viewBox='0 0 144 72')=>`<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="${viewBox}">${body}</svg>`;
test('text stroke zero font excludes both roles by each owner while normal text and zero-dimension lines remain measured',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const cases=[
  {name:'zero-text',body:'<text id="zero" x="10" y="20" font-size="0px">HIM</text>',zero:['zero'],visible:[],lines:[]},
  {name:'zero-tspan',body:'<text><tspan id="zero" x="10" y="20" font-size="0px">HIM</tspan></text>',zero:['zero'],visible:[],lines:[]},
  {name:'normal-text',body:'<text id="visible" x="10" y="20" font-size="8px">HIM</text>',zero:[],visible:['visible'],lines:[]},
  {name:'normal-tspan',body:'<text><tspan id="visible" x="10" y="20" font-size="8px">HIM</tspan></text>',zero:[],visible:['visible'],lines:[]},
  {name:'parent-zero-child-eight',body:'<text id="zero" x="10" y="20" font-size="0px">HI<tspan id="visible" x="60" y="30" font-size="8px">HIM</tspan></text>',zero:['zero'],visible:['visible'],lines:[]},
  {name:'parent-eight-child-zero',body:'<text id="visible" x="10" y="20" font-size="8px">HI<tspan id="zero" x="60" y="30" style="font-size:0px">HIM</tspan></text>',zero:['zero'],visible:['visible'],lines:[]},
  {name:'inherited-zero',body:'<text font-size="0px"><tspan id="zero" x="10" y="20">HIM</tspan></text>',zero:['zero'],visible:[],lines:[]},
  {name:'legal-zero-dimension-lines',body:'<line id="horizontal" x1="10" y1="20" x2="70" y2="20"/><line id="vertical" x1="80" y1="10" x2="80" y2="60"/>',zero:[],visible:[],lines:['horizontal','vertical']}
 ];
 const rows=await page.evaluate(async(cases)=>{const w=window as any,fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json()),out=[];for(const c of cases){const xml=`<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="0 0 144 72"><g font-family="DejaVu Sans" stroke="black" stroke-width=".1">${c.body}</g></svg>`,p=w.inputModule.parseSvg(new TextEncoder().encode(xml),c.name+'.svg');if(p.kind!=='accepted'||p.prepared.preview.status!=='enabled')throw Error(JSON.stringify(p));const before=[...document.body.children],r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:12,profileId:p.prepared.profileId,fontStatus},document.getElementById('stage'));out.push({c,r,nodes:p.prepared.nodes,findings:w.rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}),noLeak:before.length===document.body.children.length&&before.every((e,i)=>e===document.body.children[i])});}return out;},cases);
 for(const {c,r,nodes,findings,noLeak} of rows){checkReport(r);expect.soft(r.run.status,c.name).toBe('complete');expect.soft(noLeak).toBe(true);expect.soft(r.coverage.enumerationComplete).toBe(true);expect.soft(new Set(r.objects.map((o:any)=>o.objectId+':'+o.kind)).size).toBe(r.objects.length);const id=(name:string)=>nodes.find((n:any)=>n.sourceId===name)!.objectId;
 for(const name of c.zero)for(const kind of ['text','stroke']){const o=r.objects.find((o:any)=>o.objectId===id(name)&&o.kind===kind);expect.soft(o.status,c.name+' '+kind).toBe('excluded');expect.soft(o.reasonCodes).toEqual(['NOT_RENDERED']);expect.soft(o.finalPt).toBeNull();expect.soft(o.bounds).toBeNull();}
 for(const name of c.visible)for(const kind of ['text','stroke']){const o=r.objects.find((o:any)=>o.objectId===id(name)&&o.kind===kind);expect.soft(o.status).toBe('measured');expect.soft(Math.abs(o.finalPt-(kind==='text'?8:.1))).toBeLessThanOrEqual(.01);expect.soft(o.bounds).not.toBeNull();}
 expect.soft(r.coverage.text).toEqual({discovered:c.zero.length+c.visible.length,measured:c.visible.length,unassessed:0,excluded:c.zero.length,pending:0});expect.soft(r.coverage.stroke).toEqual({discovered:c.zero.length+c.visible.length+c.lines.length,measured:c.visible.length+c.lines.length,unassessed:0,excluded:c.zero.length,pending:0});
 expect.soft(findings.map((f:any)=>f.id).sort()).toEqual([...c.visible,...c.lines].map(name=>id(name)+':THIN_STROKE').sort());
 for(const name of c.lines){const o=r.objects.find((o:any)=>o.objectId===id(name)&&o.kind==='stroke');expect.soft(o.status).toBe('measured');expect.soft(Math.abs(o.finalPt-.1)).toBeLessThanOrEqual(.01);expect.soft(o.bounds[name==='horizontal'?'height':'width']).toBe(0);expect.soft(o.bounds[name==='horizontal'?'width':'height']).toBeGreaterThan(0);}
 }
});
test('text stroke candidates retain direct owners, inherited paint, distinct child paint and excluded denominators',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const data=await page.evaluate(async(xml)=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode(xml),'text-stroke.svg');if(p.kind!=='accepted'||p.prepared.preview.status!=='enabled')throw Error(JSON.stringify(p));
 const fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json()),out=[];
 for(const widthMm of [50.8,25.4]){const r=await w.measureModule.measureSvg(p.prepared,{widthMm,revision:7,profileId:p.prepared.profileId,fontStatus},document.getElementById('stage'));out.push({widthMm,r,findings:w.rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25})});}return {nodes:p.prepared.nodes,out};
 },svg('<g font-family="DejaVu Sans" font-size="8px"><text id="direct" x="10" y="15" stroke="black" stroke-width=".1">HIM</text><g stroke="black" stroke-width=".2"><text id="container"><tspan id="inherited" x="30" y="30">HIM</tspan></text></g><text id="parent" x="10" y="20" stroke="black" stroke-width=".1">HI<tspan id="child" x="100" y="60" font-size="4px" stroke="red" stroke-width=".5">M</tspan></text><text id="plain" x="10" y="40">HIM</text><text id="zero" stroke="black" stroke-width="0">HIM</text><text id="transparent" stroke="#0000" stroke-width=".1">HIM</text><text id="opacity" stroke="black" stroke-opacity="0">HIM</text><text id="hidden" display="none" stroke="black" stroke-width=".1">HIM</text></g>'));
 const id=(name:string)=>data.nodes.find((n:any)=>n.sourceId===name)!.objectId;
 for(const {widthMm,r,findings} of data.out){checkReport(r);expect(r.run.status).toBe('complete');expect(r.coverage.enumerationComplete).toBe(true);
 expect(r.coverage.text).toEqual({discovered:9,measured:8,unassessed:0,excluded:1,pending:0});expect(r.coverage.stroke).toEqual({discovered:9,measured:4,unassessed:0,excluded:5,pending:0});
 expect(new Set(r.objects.map((o:any)=>o.objectId+':'+o.kind)).size).toBe(18);expect(r.objects.some((o:any)=>o.objectId===id('container'))).toBe(false);
 const factor=widthMm===50.8?1:.5;
 for(const [name,pt] of [['direct',.1],['inherited',.2],['parent',.1],['child',.5]] as const){const text=r.objects.find((o:any)=>o.objectId===id(name)&&o.kind==='text'),stroke=r.objects.find((o:any)=>o.objectId===id(name)&&o.kind==='stroke');expect(stroke.status).toBe('measured');expect(Math.abs(stroke.finalPt-pt*factor)).toBeLessThanOrEqual(.01);expect(stroke.bounds).toEqual(text.bounds);expect(stroke.locationAccuracy).toBe('exact-environment');expect(stroke.sourcePath).toBe(data.nodes.find((n:any)=>n.sourceId===name)!.sourcePath);}
 const parent=r.objects.find((o:any)=>o.objectId===id('parent')&&o.kind==='stroke');expect(parent.bounds.width*r.finalSize.widthPx).toBeLessThan(40);expect(parent.bounds.y*r.finalSize.heightPx).toBeLessThan(30);
 expect(findings.filter((f:any)=>f.ruleId==='THIN_STROKE').map((f:any)=>f.objectId).sort()).toEqual(['direct','inherited','parent'].map(id).sort());
 for(const name of ['plain','zero','transparent','opacity','hidden'])expect(r.objects.find((o:any)=>o.objectId===id(name)&&o.kind==='stroke').reasonCodes).toEqual(['NOT_RENDERED']);
 }
});
test('text stroke unknown capabilities remain unassessed with stable IDs and schema counts',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async(xml)=>{const w=window as any,out=[];for(const markup of [xml,xml.replace('</svg>','<filter/></svg>')]){const p=w.inputModule.parseSvg(new TextEncoder().encode(markup),'text-unknown.svg');if(p.kind!=='accepted')throw Error(JSON.stringify(p));const r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'));out.push({r,findings:w.rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25})});}return out;
 },svg('<text font-size="8px" stroke="black" stroke-width=".1" vector-effect="non-scaling-stroke">HIM</text><text><tspan font-size="8px" stroke="black" stroke-width=".1" vector-effect="non-scaling-stroke">HIM</tspan></text><g transform="scale(2,1)"><text font-size="8px" stroke="black" stroke-width=".1">HIM</text></g><text rotate="10" font-size="8px" stroke="black" stroke-width=".1">HIM</text>'));
 for(const {r,findings} of result){checkReport(r);expect(r.run.status).toBe('complete');expect(r.coverage.stroke).toEqual({discovered:4,measured:0,unassessed:4,excluded:0,pending:0});expect(findings).toEqual([]);expect(new Set(r.objects.map((o:any)=>o.objectId+':'+o.kind)).size).toBe(8);for(const o of r.objects.filter((o:any)=>o.kind==='stroke')){expect(o.finalPt).toBeNull();expect(o.bounds).toBeNull();}}
 expect(result[0].r.objects.filter((o:any)=>o.kind==='stroke').map((o:any)=>o.reasonCodes[0])).toEqual(['VECTOR_EFFECT','VECTOR_EFFECT','TRANSFORM_NONUNIFORM','TEXT_ROTATE_UNSUPPORTED']);expect(result[1].r.objects.every((o:any)=>o.reasonCodes.includes('UNSUPPORTED_VISUAL_FEATURE'))).toBe(true);
});
test('measure root inverse mapping preserves 144pt truth across widths, transforms and display scale',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const results=await page.evaluate(async({svg})=>{const w=window as any;if(!w.measureModule)return {error:w.measureError};const result=[];
 for(const widthMm of [50.8,25.4])for(const transform of ['translate(0)', 'scale(.5)','rotate(30)']){
 const p=w.inputModule.parseSvg(new TextEncoder().encode(svg.replace('TRANSFORM',transform)),'truth.svg');
 if(p.kind!=='accepted')throw Error(JSON.stringify(p));
 const stage=document.getElementById('stage')!;stage.style.transform='translate(27px,19px) scale(.63)';
 const r=await w.measureModule.measureSvg(p.prepared,{widthMm,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.37',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},stage);
 result.push({widthMm,transform,r,remaining:stage.children.length});}return {result};
 },{svg:svg('<g transform="TRANSFORM"><text x="30" y="25" font-size="8px">HIM</text><line x1="10" y1="40" x2="100" y2="40" stroke="black" stroke-width=".5"/></g>')});
 expect(results.error).toBeUndefined();
 for(const row of results.result!){checkReport(row.r);expect(row.r.run.status).toBe('complete');expect(row.remaining).toBe(0);const factor=(row.widthMm===50.8?1:.5)*(row.transform==='scale(.5)'?.5:1);
 expect(row.r.objects.find((o:any)=>o.kind==='text').finalPt).toBeCloseTo(8*factor,2);
 expect(row.r.objects.find((o:any)=>o.kind==='stroke'&&o.status==='measured').finalPt).toBeCloseTo(.5*factor,2);}
});
test('text stroke stops preserve both pending roles, partial findings and host cleanup',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const rows=await page.evaluate(async(xml)=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode(xml),'stroke-stop.svg');if(p.kind!=='accepted')throw Error(JSON.stringify(p));const out=[],stage=document.getElementById('stage')!,fontStatus={status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']},original=SVGGraphicsElement.prototype.getBBox,now=performance.now.bind(performance),before=[...document.body.children];
 for(const mode of ['cancel','timeout','geometry'])for(const after of [1,3]){let count=0,offset=0;const controller=new AbortController();Object.defineProperty(performance,'now',{configurable:true,value:()=>now()+offset});SVGGraphicsElement.prototype.getBBox=function(...args){const b=original.apply(this,args);if(++count===after){if(mode==='cancel')controller.abort();else if(mode==='timeout')offset=15001;else throw Error('injected text geometry failure');}return b;};
 try{const r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:9,profileId:p.prepared.profileId,fontStatus},stage,controller.signal);out.push({mode,after,r,findings:w.rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}),noLeak:before.length===document.body.children.length&&before.every((e,i)=>e===document.body.children[i])});}finally{SVGGraphicsElement.prototype.getBBox=original;Object.defineProperty(performance,'now',{configurable:true,value:now});}}
 return out;
 },svg('<text x="10" y="20" font-size="8px" stroke="black" stroke-width=".1">HIM</text><text x="60" y="40" font-size="8px" stroke="black" stroke-width=".2">HIM</text>'));
 for(const {mode,after,r,findings,noLeak} of rows){checkReport(r);expect(noLeak).toBe(true);expect(r.coverage.enumerationComplete).toBe(true);expect(new Set(r.objects.map((o:any)=>o.objectId+':'+o.kind)).size).toBe(r.objects.length);
 if(mode==='geometry'){expect(r.run.status).toBe('complete');expect(r.coverage.stroke).toEqual({discovered:2,measured:2,unassessed:0,excluded:0,pending:0});expect(r.coverage.text).toEqual({discovered:2,measured:1,unassessed:1,excluded:0,pending:0});expect(findings.filter((f:any)=>f.ruleId==='THIN_STROKE').length).toBe(2);}
 else{expect(r.run).toEqual({status:after===1?(mode==='cancel'?'cancelled':'timeout'):'partial',stopReason:mode==='cancel'?'cancelled':'timeout'});for(const kind of ['text','stroke'])expect(r.coverage[kind]).toEqual({discovered:2,measured:after===1?0:1,unassessed:0,excluded:0,pending:after===1?2:1});expect(findings.filter((f:any)=>f.ruleId==='THIN_STROKE').length).toBe(after===1?0:1);}
 }
});
test('measure coverage excludes hidden definitions, flags use and unsupported values, never mounts disabled input',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const results=await page.evaluate(async(xml)=>{const w=window as any;const out=[];for(const markup of [xml,xml.replace('</svg>','<filter id="f"/></svg>')]){
 const p=w.inputModule.parseSvg(new TextEncoder().encode(markup),'coverage.svg');if(p.kind!=='accepted')throw Error(JSON.stringify(p));let mounted=0;const stage=document.getElementById('stage')!;const observer=new MutationObserver(r=>{mounted+=r.filter(m=>m.addedNodes.length).length});observer.observe(stage,{childList:true});
 const r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},stage);await Promise.resolve();observer.disconnect();out.push({r,mounted});}return out;
 },svg('<defs><path id="def" d="M0 0L10 10" stroke="black"/></defs><use href="#def"/><g display="none"><text font-size="8px">Hidden</text></g><text><tspan x="10" y="30" font-size="8px">HIM</tspan></text><g transform="scale(2,1)"><text font-size="8px">HIM</text></g><line x2="10" stroke="black" vector-effect="non-scaling-stroke"/><text rotate="10" font-size="8px">HIM</text>'));
 for(const item of results)checkReport(item.r);const r=results[0].r;expect(r.run.status).toBe('complete');expect(r.coverage.text).toEqual({discovered:4,measured:1,unassessed:2,excluded:1,pending:0});expect(r.coverage.stroke).toEqual({discovered:7,measured:0,unassessed:2,excluded:5,pending:0});
 expect(results[1].mounted).toBe(0);expect(results[1].r.objects.every((o:any)=>o.status==='unassessed'&&o.reasonCodes.includes('UNSUPPORTED_VISUAL_FEATURE'))).toBe(true);
});
test('measure cancellation yields to tasks and preserves pending, partial, revision and cleanup',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async()=>{const w=window as any,stage=document.getElementById('stage')!,fs={status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']};
 const p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72">'+'<text x="10" y="20" font-size="8px">HIM</text>'.repeat(2500)+'</svg>'),'many.svg').prepared;
 const opt={widthMm:25.4,revision:1,profileId:p.profileId,fontStatus:fs};const oldSize=await w.measureModule.measureSvg(p,{...opt,widthMm:50.8},stage);const pre=new AbortController();pre.abort();const cancelled=await w.measureModule.measureSvg(p,opt,stage,pre.signal);
 const controller=new AbortController(),originalNext=TreeWalker.prototype.nextNode;let visited=0;
 TreeWalker.prototype.nextNode=function(){const value=originalNext.call(this);if(++visited===200)setTimeout(()=>controller.abort(),0);return value;};
 const mid=await w.measureModule.measureSvg(p,opt,stage,controller.signal);TreeWalker.prototype.nextNode=originalNext;
 const oldPromise=w.measureModule.measureSvg(p,opt,stage);const nextPromise=w.measureModule.measureSvg(p,{...opt,revision:2},stage);const [old,next]=await Promise.all([oldPromise,nextPromise]);
 return {oldSize,cancelled,mid,old,next,children:stage.children.length};});
 expect(result.oldSize.run).toEqual({status:'limited',stopReason:'RASTER_WORK_LIMIT'});expect(result.oldSize.objects).toEqual([]);expect(result.oldSize.coverage.enumerationComplete).toBe(false);
 expect(result.cancelled.run.status).toBe('cancelled');expect(result.cancelled.objects).toEqual([]);expect(result.cancelled.coverage.enumerationComplete).toBe(false);
 expect(['cancelled','partial']).toContain(result.mid.run.status);expect(result.mid.coverage.enumerationComplete).toBe(false);expect(result.mid.coverage.text.pending).toBeGreaterThan(0);
 expect(['cancelled','partial']).toContain(result.old.run.status);expect(result.next.run.status).toBe('complete');expect(result.next.revision).toBe(2);expect(result.children).toBe(0);
});
test('measure real bad 85mm has exactly three small text and one thin stroke; fixed removes those findings',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async(files)=>{const w=window as any,out=[];const a=await(await fetch('/font-assets.json')).json(),fontStatus=await w.fontModule.loadTrustedFont(a);
 for(const xml of files){const p=w.inputModule.parseSvg(new TextEncoder().encode(xml),'real.svg');if(p.kind!=='accepted')throw Error(JSON.stringify(p));const r=await w.measureModule.measureSvg(p.prepared,{widthMm:85,revision:0,profileId:p.prepared.profileId,fontStatus},document.getElementById('stage'));out.push({r,findings:w.rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25})});}return out;},['01-bad.svg','02-fixed.svg'].map(f=>readFileSync('fixtures/'+f,'utf8')));
 expect(result[0].r.run.status).toBe('complete');expect(result[0].findings.filter((f:any)=>f.ruleId==='SMALL_TEXT').map((f:any)=>Math.round(f.actualPt*100)/100).sort()).toEqual([5,5.5,5.75]);
 expect(result[0].findings.filter((f:any)=>f.ruleId==='THIN_STROKE').map((f:any)=>Math.round(f.actualPt*100)/100)).toEqual([.15]);expect(result[1].findings).toEqual([]);
});
test('measure keeps zero-result and partial timeout/cancel/error states and finite unknown geometry',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const data=await page.evaluate(async()=>{const w=window as any,stage=document.getElementById('stage')!,fontStatus={status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']};
 const p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72">'+['10','20','30'].map(y=>`<text x="10" y="${y}" font-size="5px">HIM</text>`).join('')+'</svg>'),'state.svg').prepared;
 const opt={widthMm:50.8,revision:0,profileId:p.profileId,fontStatus},results=[];
 const original=SVGGraphicsElement.prototype.getBBox,now=performance.now.bind(performance);
 for(const mode of ['cancel','timeout','geometry'])for(const after of [1,2]){
  let count=0,offset=0;const c=new AbortController();Object.defineProperty(performance,'now',{configurable:true,value:()=>now()+offset});
  SVGGraphicsElement.prototype.getBBox=function(...args){const box=original.apply(this,args);if(++count===after){if(mode==='cancel')c.abort();if(mode==='timeout')offset=15001;if(mode==='geometry')throw Error('injected geometry failure');}return box;};
  const r=await w.measureModule.measureSvg(p,opt,stage,c.signal);results.push({mode,after,r,children:stage.children.length});
  SVGGraphicsElement.prototype.getBBox=original;Object.defineProperty(performance,'now',{configurable:true,value:now});
 }
 const screen=SVGSVGElement.prototype.getScreenCTM;SVGSVGElement.prototype.getScreenCTM=function(){throw Error('injected root init failure')};const init=await w.measureModule.measureSvg(p,opt,stage);SVGSVGElement.prototype.getScreenCTM=screen;
 return {results,init};});
 for(const {mode,after,r,children} of data.results){checkReport(r);expect(children).toBe(0);expect(r.coverage.text.discovered).toBe(r.coverage.text.measured+r.coverage.text.unassessed+r.coverage.text.excluded+r.coverage.text.pending);
 if(mode==='geometry'){expect(r.run.status).toBe('complete');expect(r.objects.filter((o:any)=>o.reasonCodes.includes('ENGINE_GEOMETRY_ERROR')).length).toBe(1);}
 else{expect(r.run.status).toBe(after===1?(mode==='cancel'?'cancelled':'timeout'):'partial');expect(r.run.stopReason).toBe(mode==='cancel'?'cancelled':'timeout');expect(r.coverage.text.pending).toBe(4-after);}
 }
 checkReport(data.init);expect(data.init.run.status).toBe('engine-error');expect(data.init.objects).toEqual([]);
});
test('measure real outline/mixed retain unknown coverage and limits never fake a complete run',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const data=await page.evaluate(async(files)=>{const w=window as any,out=[];for(const [name,xml] of files){const p=w.inputModule.parseSvg(new TextEncoder().encode(xml),name);if(p.kind!=='accepted')throw Error(JSON.stringify(p));const opt={widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}};const r=await w.measureModule.measureSvg(p.prepared,opt,document.getElementById('stage'));out.push({name,r});for(const widthMm of [0,501,NaN])out.push({name:'limited',r:await w.measureModule.measureSvg(p.prepared,{...opt,widthMm},document.getElementById('stage'))});}return out;},['11-outline.svg','12-mixed.svg','13-nonuniform.svg','14-vector-effect.svg'].map(f=>[f,readFileSync('fixtures/'+f,'utf8')]));
 for(const {name,r} of data){if(name==='limited'){expect(r.run.status).toBe('limited');expect(r.objects).toEqual([]);expect(r.coverage.enumerationComplete).toBe(false);continue;}
 expect(r.run.status).toBe('complete');expect(r.coverage.possibleOutline).toBe(true);if(name.startsWith('11'))expect(r.coverage.text.discovered).toBe(0);if(name.startsWith('12'))expect(r.coverage.text.measured).toBe(1);if(name.startsWith('13'))expect(r.coverage.text.unassessed).toBe(1);if(name.startsWith('14'))expect(r.objects.some((o:any)=>o.reasonCodes.includes('VECTOR_EFFECT'))).toBe(true);}
});
test('measure cleanup failure retains partial records and removes only its own host',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async()=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><text font-size="5px">HIM</text></svg>'),'cleanup.svg'),original=Element.prototype.remove;let failed=false;
 Element.prototype.remove=function(){if(this instanceof HTMLDivElement&&!failed){failed=true;throw Error('injected cleanup failure');}return original.call(this);};
 try{return {r:await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'))};}catch(e){return {error:String(e)};}finally{Element.prototype.remove=original;}});
 expect(result.error).toBeUndefined();expect(result.r.run).toEqual({status:'partial',stopReason:'engine-error'});expect(result.r.objects.length).toBe(2);
});
test('measure same-document owners preserve caller DOM and isolate simultaneous hosts',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async()=>{const w=window as any,stage=document.getElementById('stage')!;stage.innerHTML='<span>Caller sentinel</span>';const another=document.createElement('section');another.textContent='Other owner';document.body.appendChild(another);const before=[...document.body.children],caller=stage.innerHTML,other=another.innerHTML;
 const bytes=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72">'+'<text font-size="8px">HIM</text>'.repeat(2000)+'</svg>'),p=w.inputModule.parseSvg(bytes,'owners.svg').prepared,source=p.sanitizedMarkup;const opt={widthMm:25.4,revision:1,profileId:p.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}};
 const oldSize=await w.measureModule.measureSvg(p,{...opt,widthMm:50.8},stage);
 const a=new AbortController(),one=w.measureModule.measureSvg(p,opt,stage,a.signal),two=w.measureModule.measureSvg(p,{...opt,revision:2},another);setTimeout(()=>a.abort(),10);const [r1,r2]=await Promise.all([one,two]);
 return {oldSize,first:r1.run,second:r2.run,callerUnchanged:stage.innerHTML===caller&&another.innerHTML===other,noLeak:before.length===document.body.children.length&&before.every((e,i)=>document.body.children[i]===e),sourceUnchanged:p.sanitizedMarkup===source};});
 expect(result.oldSize.run).toEqual({status:'limited',stopReason:'RASTER_WORK_LIMIT'});expect(result.oldSize.objects).toEqual([]);
 expect(['cancelled','partial']).toContain(result.first.status);expect(result.second.status).toBe('complete');expect(result.callerUnchanged).toBe(true);expect(result.noLeak).toBe(true);expect(result.sourceUnchanged).toBe(true);
});
test('measure invisible zero-width and transparent paint are excluded rather than small findings',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');const r=await page.evaluate(async()=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><line x2="10" stroke="black" stroke-width="0"/><line x2="10" stroke="#0000" stroke-width=".1"/><text font-size="5px" fill-opacity="0">HIM</text></svg>'),'invisible.svg');return w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'));});
 expect(r.objects.map((o:any)=>o.status)).toEqual(['excluded','excluded','excluded','excluded']);
});
test('measure primitive corners and nonzero viewBox stay within one final CSS pixel',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');const r=await page.evaluate(async()=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="10 20 144 72"><rect x="30" y="40" width="60" height="12" stroke="black" stroke-width=".5"/><line x1="20" y1="60" x2="100" y2="60" stroke="black" stroke-width=".5"/></svg>'),'corners.svg');return w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'));});
 const expected=[[20*4/3,20*4/3,60*4/3,12*4/3],[10*4/3,40*4/3,80*4/3,0]];
 for(let i=0;i<2;i++){const b=r.objects[i].bounds,actual=[b.x*192,b.y*96,b.width*192,b.height*96];for(let j=0;j<4;j++)expect(Math.abs(actual[j]-expected[i][j])).toBeLessThanOrEqual(1);expect(r.objects[i].finalPt).toBeCloseTo(.5,2);}
});
test('root transform screen matrices follow outer-viewport order and measurement retains that transform',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const cases=[{t:'scale(2)',vb:'0 0 144 72',a:8/3,b:0,c:0,d:8/3,e:0,f:0,pt:16},{t:'translate(10 7)',vb:'10 20 144 72',a:4/3,b:0,c:0,d:4/3,e:10-40/3,f:7-80/3,pt:8},{t:'rotate(90)',vb:'0 0 144 72',a:0,b:4/3,c:-4/3,d:0,e:0,f:0,pt:8}];
 const result=await page.evaluate(async(cases)=>{const w=window as any,out=[];for(const c of cases){const xml=`<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="${c.vb}" transform="${c.t}"><text x="30" y="35" font-size="8px">HIM</text><line x1="20" y1="40" x2="100" y2="40" stroke="black" stroke-width=".5"/></svg>`;
 const native=new DOMParser().parseFromString(xml,'image/svg+xml').documentElement as unknown as SVGSVGElement;native.style.cssText='position:absolute;left:0;top:0;transform-origin:0 0;';document.body.appendChild(native);const matrix=native.getScreenCTM()!,screen={a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f};native.remove();
 const p=w.inputModule.parseSvg(new TextEncoder().encode(xml),'root.svg');const r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'));out.push({c,screen,r});}return out;},cases);
 console.log(JSON.stringify({rootTransformEvidence:result.map(({c,screen})=>({transform:c.t,viewBox:c.vb,screen}))}));
 for(const {c,screen,r} of result){for(const k of ['a','b','c','d','e','f'] as const)expect(screen[k],c.t+' native '+k).toBeCloseTo(c[k],5);expect(r.objects[0].finalPt,c.t+' retained root scale').toBeCloseTo(c.pt,2);for(const k of ['a','b','c','d','e','f'] as const)expect(r.objects[0].matrix[k],c.t+' measured '+k).toBeCloseTo(c[k],5);}
});
test('root singular and nonuniform matrices remain unassessed without false zero values',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');const reports=await page.evaluate(async()=>{const w=window as any,out=[];for(const transform of ['scale(0)','scale(2,1)']){const p=w.inputModule.parseSvg(new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72" transform="${transform}"><text font-size="8px">HIM</text></svg>`),'singular.svg');out.push(await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage')));}return out;});
 for(const r of reports){expect(r.run.status).toBe('complete');expect(r.objects[0].status).toBe('unassessed');expect(r.objects[0].finalPt).toBeNull();expect(r.objects[0].bounds).toBeNull();}
});
