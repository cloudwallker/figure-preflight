import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const reference=JSON.parse(readFileSync('fixtures/text-reference.json','utf8'));
// References are independently generated from cmap/hmtx/head/glyph outlines, never browser geometry.
for(const dpr of [1,2])test(`text-location independent ink/envelope, advance and four-corner truth DPR ${dpr}`,async({browser})=>{
 const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1200,height:900}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:48616/');await expect(page.locator('#ready')).toHaveText('ready');
 await page.evaluate(async()=>{const w=window as any;w.fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json());});
 const names=Object.keys(reference.files);
 for(const name of names){const data=reference.files[name];for(const c of data.cases){for(const fit of (Number(name.slice(0,2))<=10?[1,.63]:[1])){
 const measured=await page.evaluate(async({xml,widthMm,fit,rootTransform})=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode(rootTransform?xml.replace('<svg ','<svg transform="'+rootTransform+'" '):xml),'location.svg');if(p.kind!=='accepted'||p.prepared.preview.status!=='enabled')throw Error(JSON.stringify(p));
 const stage=document.getElementById('stage')!;stage.style.transform=`scale(${fit})`;return w.measureModule.measureSvg(p.prepared,{widthMm,revision:0,profileId:p.prepared.profileId,fontStatus:w.fontStatus},stage);},{xml:readFileSync('fixtures/'+name,'utf8'),widthMm:c.widthMm,fit,rootTransform:c.rootTransform});
 expect(measured.run.status,`${name} complete`).toBe('complete');
 if(name.startsWith('01')||Number(name.slice(0,2))>=21){
  const actualFindings=await page.evaluate(r=>(window as any).rulesModule.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}),measured);
  const expectedFindings=c.records.filter((r:any)=>r.finalPt<(r.kind==='text'?6:.25)-1e-6).map((r:any)=>r.objectId+':'+(r.kind==='text'?'SMALL_TEXT':'THIN_STROKE')).sort();
  expect(actualFindings.map((f:any)=>f.id).sort(),name+' no unexpected findings').toEqual(expectedFindings);
 }
 for(const ref of c.records){const actual=measured.objects.find((o:any)=>o.objectId===ref.objectId&&o.kind===ref.kind);expect(actual,`${name} ${ref.gid} objectId`).toBeTruthy();
 // Definition paths are independently listed but excluded from rendered numeric coverage.
 expect(actual.status,`${name} ${ref.gid} independent applicability`).toBe(ref.expectedStatus);
 if(ref.expectedStatus==='excluded')continue;
 expect(actual.status,`${name} ${ref.gid}`).toBe('measured');expect(actual.finalPt,`${name} ${ref.gid} pt`).toBeCloseTo(ref.finalPt,2);expect(actual.locationAccuracy).toBe('exact-environment');
 const b=actual.bounds,edges=[b.x*c.widthPx,b.y*c.heightPx,(b.x+b.width)*c.widthPx,(b.y+b.height)*c.heightPx];
 if(ref.kind==='text'){
 for(const i of [0,1]){expect(edges[i],`${name} ${ref.gid} lower edge ${i}`).toBeGreaterThanOrEqual(ref.envelopeAabb[i]-1);expect(edges[i]).toBeLessThanOrEqual(ref.inkAabb[i]+1);}
 for(const i of [2,3]){expect(edges[i],`${name} ${ref.gid} fit ${fit} upper edge ${i}`).toBeLessThanOrEqual(ref.envelopeAabb[i]+1);expect(edges[i]).toBeGreaterThanOrEqual(ref.inkAabb[i]-1);}
 if(ref.advancePx){expect(Math.abs(edges[0]-ref.advancePx[0]),`${name} advance left`).toBeLessThanOrEqual(1);expect(Math.abs(edges[2]-ref.advancePx[1]),`${name} advance right`).toBeLessThanOrEqual(1);}
 }else for(let i=0;i<4;i++)expect(Math.abs(edges[i]-ref.boxAabb[i]),`${name} line corner ${i}`).toBeLessThanOrEqual(1);
 }
 }}}
 await context.close();
});
test('text-location independent anchor clicks resolve stable objectIds in the measurement harness',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 await page.evaluate(async()=>{const w=window as any;w.fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json());});
 for(const name of ['01-bad.svg','03-144pt.svg','04-rotate.svg','05-uniform.svg','06-nonzero-viewbox.svg','10-tspan.svg']){
  const c=reference.files[name].cases[0];
  for(const fit of [1,.63]){
   await page.evaluate(({xml,width,height,fit})=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode(xml),'click.svg');const stage=document.getElementById('stage')!;stage.replaceChildren();stage.style.cssText=`position:absolute;left:0;top:100px;transform-origin:0 0;transform:scale(${fit})`;const root=new DOMParser().parseFromString(p.prepared.sanitizedMarkup,'image/svg+xml').documentElement;root.setAttribute('width',String(width));root.setAttribute('height',String(height));
   const source=new Map(p.prepared.nodes.map((n:any)=>[n.sanitizedId,n.objectId])),objects=new WeakMap<Element,string>();for(const el of root.querySelectorAll('[id]'))objects.set(el,source.get(el.id) as string);root.addEventListener('click',event=>{w.selected=objects.get(event.target as Element)??null;});stage.appendChild(root);w.selected=null;
   },{xml:readFileSync('fixtures/'+name,'utf8'),width:c.widthPx,height:c.heightPx,fit});
   for(const ref of c.records.filter((r:any)=>r.kind==='text'&&(name!=='01-bad.svg'||r.gid.startsWith('small-')))){
    await page.mouse.click(ref.clickPx[0]*fit,100+ref.clickPx[1]*fit);
    expect(await page.evaluate(()=>(window as any).selected),`${name} ${ref.gid} independent hit`).toBe(ref.objectId);
   }
  }
 }
});
test('text-location direct text does not borrow nested tspan bounds',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const objects=await page.evaluate(async()=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><text x="10" y="20" font-size="8px">HIM<tspan x="100" y="60" font-size="4px">HIM</tspan></text></svg>'),'direct.svg');return (await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:{status:'unavailable',family:'DejaVu Sans',version:'2.35',sha256:'a'.repeat(64),licenseRef:'license',reasonCodes:['NOT_LOADED']}},document.getElementById('stage'))).objects.filter((o:any)=>o.kind==='text');});
 expect(objects.length).toBe(2);expect(objects[0].bounds.width*192).toBeLessThan(40);expect(objects[0].bounds.y*96).toBeLessThan(30);expect(objects[1].finalPt).toBeCloseTo(4,2);
});
