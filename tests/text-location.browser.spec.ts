import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {textBoundsForEngine} from './text-bounds-reference.js';
const reference=JSON.parse(readFileSync('fixtures/text-reference.json','utf8'));
// Both text references are generated from the bundled font, independently of browser geometry.
for(const dpr of [1,2])test(`text-location independent ink/envelope, advance and four-corner truth DPR ${dpr}`,async({browser,browserName})=>{
 const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1200,height:900}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:48616/');await expect(page.locator('#ready')).toHaveText('ready');
 await page.evaluate(async()=>{const w=window as any;w.fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json());});
 const names=Object.keys(reference.files);
 for(const name of names){const data=reference.files[name];for(const c of data.cases){for(const fit of (Number(name.slice(0,2))<=10?[1,.63]:[1])){
 const measured=await page.evaluate(async({xml,widthMm,fit,rootTransform})=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode(rootTransform?xml.replace('<svg ','<svg transform="'+rootTransform+'" '):xml),'location.svg');if(p.kind!=='accepted'||p.prepared.preview.status!=='enabled')throw Error(JSON.stringify(p));
 const stage=document.getElementById('stage')!;stage.style.transform=`scale(${fit})`;return w.measureModule.measureSvg(p.prepared,{widthMm,revision:0,profileId:p.prepared.profileId,fontStatus:w.fontStatus},stage);},{xml:readFileSync('fixtures/'+name,'utf8'),widthMm:c.widthMm,fit,rootTransform:c.rootTransform});
 // Bounded CI evidence for the synthetic Time label; measurement and independent assertions stay unchanged.
 if(dpr===1&&name==='01-bad.svg'&&c===data.cases[0]){
  const diagnostics=await page.evaluate(async({xml,widthPx,heightPx,fit,rootTransform,actual})=>{
   const w=window as any,stage=document.getElementById('stage')!,source=new DOMParser().parseFromString(xml,'image/svg+xml').documentElement;
   const label=source.querySelector('#text_6 text') as SVGTextElement;
   if(label?.textContent!=='Time')throw Error('Expected the synthetic Time diagnostic label');
   const assets=await(await fetch('/font-assets.json')).json(),bytes=Uint8Array.from(atob(assets.base64),c=>c.charCodeAt(0));
   if(bytes.length>1048576)throw Error('Diagnostic font byte limit');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==w.fontStatus.sha256)throw Error('Diagnostic trusted font hash mismatch');
   const family='FigurePreflightTimeDiagnostic_'+crypto.randomUUID(),face=new FontFace(family,bytes,{style:'normal',weight:'400',stretch:'normal'}),hosts:HTMLElement[]=[];
   let timer:ReturnType<typeof setTimeout>|undefined;
   const result:any={text:'Time',dpr:devicePixelRatio,fit,rootTransform,widthPx,heightPx,stageTransform:stage.style.transform,
    environment:{browserName:actual.environment.browserName,browserVersion:actual.environment.browserVersion,platform:actual.environment.platform},
    fontStatus:{status:w.fontStatus.status,family:w.fontStatus.family,version:w.fontStatus.version,sha256:w.fontStatus.sha256,reasonCodes:w.fontStatus.reasonCodes.slice(0,4)},
    fontBytesSha256:hash,measured:{bounds:actual.label.bounds,matrix:actual.label.matrix,finalPt:actual.label.finalPt,locationAccuracy:actual.label.locationAccuracy},samples:[],cleanup:null};
   let renderingDiagnostic:any=null;
   const sample=(parent:HTMLElement,mount:string)=>{
    const host=document.createElement('div');host.style.cssText='all:initial;position:absolute;left:0;top:0;opacity:0;pointer-events:none;';host.setAttribute('aria-hidden','true');hosts.push(host);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',source.getAttribute('viewBox')!);svg.setAttribute('width',String(widthPx));svg.setAttribute('height',String(heightPx));
    if(source.hasAttribute('preserveAspectRatio'))svg.setAttribute('preserveAspectRatio',source.getAttribute('preserveAspectRatio')!);
    if(rootTransform)svg.setAttribute('transform',rootTransform);
    const original=label.cloneNode(true) as SVGTextElement,alias=label.cloneNode(true) as SVGTextElement;original.removeAttribute('id');alias.removeAttribute('id');alias.style.fontFamily='"'+family+'"';svg.append(original,alias);
    host.attachShadow({mode:'closed'}).appendChild(svg);parent.appendChild(host);
    const geometry=(text:SVGTextElement)=>{const b=text.getBBox(),m=text.getScreenCTM()!,css=getComputedStyle(text),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
     const style=Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariant','fontKerning','fontFeatureSettings','fontVariationSettings','fontOpticalSizing','letterSpacing','textAnchor'].map(k=>[k,String((css as any)[k]).slice(0,128)]));
     return {style,bbox:{x:b.x,y:b.y,width:b.width,height:b.height},computedTextLength:text.getComputedTextLength(),screenMatrix:{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f},screenAabb:[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))]};};
    const pair={mount,original:geometry(original),alias:geometry(alias)};
    if(mount==='body-owned-shadow'){
     const originalStyle=original.getAttribute('style'),originalInlineTextRendering=original.style.textRendering;
     const renderingGeometry=()=>{const b=original.getBBox(),m=original.getScreenCTM()!,css=getComputedStyle(original),length=original.getComputedTextLength(),screenFactor=Math.hypot(m.a,m.b);
      if(original.getNumberOfChars()!==4)throw Error('Expected four synthetic Time characters');
      const characters=Array.from({length:4},(_,i)=>{const start=original.getStartPositionOfChar(i),end=original.getEndPositionOfChar(i);return {index:i,start:{x:start.x,y:start.y},end:{x:end.x,y:end.y},substringLength:original.getSubStringLength(i,1)};});
      return {computedTextRendering:css.textRendering,fontFamily:css.fontFamily,fontSize:css.fontSize,fontKerning:css.fontKerning,bbox:{x:b.x,y:b.y,width:b.width,height:b.height},computedTextLength:length,substringLength:original.getSubStringLength(0,4),screenMatrix:{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f},screenFactor,advanceScreenPx:length*screenFactor,characters};};
     const auto=renderingGeometry();let geometricPrecision;
     try{original.style.textRendering='geometricPrecision';geometricPrecision=renderingGeometry();}
     finally{if(originalStyle===null)original.removeAttribute('style');else original.setAttribute('style',originalStyle);}
     const restoredBox=original.getBBox();
     renderingDiagnostic={text:'Time',dpr:devicePixelRatio,fit,rootTransform,widthPx,heightPx,mount,fontSha256:hash,environment:result.environment,originalInlineTextRendering,auto,geometricPrecision,
      restored:{inlineTextRendering:original.style.textRendering,computedTextRendering:getComputedStyle(original).textRendering,bbox:{x:restoredBox.x,y:restoredBox.y,width:restoredBox.width,height:restoredBox.height},computedTextLength:original.getComputedTextLength(),styleAttributeRestored:original.getAttribute('style')===originalStyle}};
    }
    return pair;
   };
   try{
    await Promise.race([face.load(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Diagnostic font load timeout')),2000);})]);
    document.fonts.add(face);result.aliasStatus=face.status;result.aliasRegistered=document.fonts.has(face);
    // Production mounts outside caller fit; the second pair records the same viewport inside caller fit.
    result.samples.push(sample(document.body,'body-owned-shadow'),sample(stage,'caller-stage-shadow'));
   }finally{if(timer!==undefined)clearTimeout(timer);for(const host of hosts)host.remove();document.fonts.delete(face);result.cleanup={hostsRemoved:hosts.every(host=>!host.isConnected),aliasRemoved:!document.fonts.has(face)};}
   return {font:result,rendering:renderingDiagnostic};
  },{xml:readFileSync('fixtures/'+name,'utf8'),widthPx:c.widthPx,heightPx:c.heightPx,fit,rootTransform:c.rootTransform,actual:{environment:measured.environment,label:measured.objects.find((o:any)=>o.objectId===c.records.find((r:any)=>r.gid==='text_6').objectId&&o.kind==='text')}});
  const diagnostic=diagnostics.font;
  const line=JSON.stringify({...diagnostic,widthMm:c.widthMm});if(line.length>8192)throw Error('Diagnostic output limit');console.log('FIGURE_TIME_FONT_DIAGNOSTIC '+line);
  const renderingLine=JSON.stringify({...diagnostics.rendering,widthMm:c.widthMm});if(renderingLine.length>4096)throw Error('Rendering diagnostic output limit');console.log('FIGURE_TIME_RENDERING_DIAGNOSTIC '+renderingLine);
 }
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
 const {inkAabb,envelopeAabb,layoutPx}=textBoundsForEngine(ref,browserName);
 for(const i of [0,1]){expect(edges[i],`${name} ${ref.gid} lower edge ${i}`).toBeGreaterThanOrEqual(envelopeAabb[i]-1);expect(edges[i]).toBeLessThanOrEqual(inkAabb[i]+1);}
 for(const i of [2,3]){expect(edges[i],`${name} ${ref.gid} fit ${fit} upper edge ${i}`).toBeLessThanOrEqual(envelopeAabb[i]+1);expect(edges[i]).toBeGreaterThanOrEqual(inkAabb[i]-1);}
 if(layoutPx){expect(Math.abs(edges[0]-layoutPx[0]),`${name} layout left`).toBeLessThanOrEqual(1);expect(Math.abs(edges[2]-layoutPx[1]),`${name} layout right`).toBeLessThanOrEqual(1);}
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
