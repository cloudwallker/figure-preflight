import {test,expect} from '@playwright/test';
import {performance as clock} from 'node:perf_hooks';
import {cpus,totalmem,platform,release} from 'node:os';
import {writeFileSync} from 'node:fs';
import {pressureCases} from './performance-cases.ts';
test('responsiveness original-cap matrix external 100ms receipts and 50ms page probe',async({page,browser},info)=>{
 test.setTimeout(600000);
 const all:any[]=[];const selected=pressureCases().filter(c=>!process.env.FIGURE_PRESSURE_FILTER||c.name.includes(process.env.FIGURE_PRESSURE_FILTER));
 const runs=Number(process.env.FIGURE_PRESSURE_RUNS??3);
 const device={os:platform()+' '+release(),cpu:cpus()[0].model,logicalCpus:cpus().length,ramBytes:totalmem(),browser:info.project.name,version:browser.version()};
 for(const sample of selected){
  await page.goto('/');await page.bringToFront();await expect(page.locator('#ready')).toHaveText('ready');
  await page.evaluate(async()=>{const w=window as any;w.fontStatus=await w.fontModule.loadTrustedFont(await(await fetch('/font-assets.json')).json());w.phases=[];
   // XMLDocument reconstruction can be connected to its own document without
   // ever entering the live page. Keep that synchronous work in the timings.
   const instrument=(prototype:any,key:string,phase:string)=>{const original=prototype[key];prototype[key]=function(...args:any[]){const start=performance.now();try{return original.apply(this,args);}finally{const live=this.ownerDocument===document&&this.isConnected;w.phases.push({phase:phase==='mount'&&!live?'detached-rebuild':phase,start,ms:performance.now()-start});}};};
   instrument(DOMParser.prototype,'parseFromString','DOMParser');instrument(Node.prototype,'appendChild','mount');instrument(SVGGraphicsElement.prototype,'getBBox','geometry');instrument(SVGGraphicsElement.prototype,'getScreenCTM','matrix');instrument(SVGSVGElement.prototype,'getScreenCTM','root-matrix');
   instrument(Element.prototype,'remove','cleanup');
  });
  for(let run=0;run<runs;run++){
  await page.evaluate(()=>{const w=window as any;w.probes=[];w.events=[];w.phases=[];w.done=false;w.controller=new AbortController();});
  await page.evaluate(s=>{const w=window as any;setTimeout(async()=>{try{const bytes=new TextEncoder().encode(s.xml);let t=performance.now();const parsed=w.inputModule.parseSvg(bytes,'pressure.svg');w.phases.push({phase:'parseSvg',start:t,ms:performance.now()-t});w.result={parseKind:parsed.kind};
   if(parsed.kind==='accepted'){t=performance.now();const measured=await w.measureModule.measureSvg(parsed.prepared,{widthMm:s.widthMm,revision:0,profileId:parsed.prepared.profileId,fontStatus:w.fontStatus},document.getElementById('stage'),w.controller.signal);w.phases.push({phase:'measureSvg',start:t,ms:performance.now()-t});w.result.measured={run:measured.run,elapsedMs:measured.elapsedMs,coverage:measured.coverage};
    if(s.texture){const size=measured.finalSize;w.result.texture={sides:[size.widthPx,size.heightPx],area:size.widthPx*size.heightPx,totalArea:4*size.widthPx*size.heightPx};const canvases=[];const prototype=new DOMParser().parseFromString(parsed.prepared.sanitizedMarkup,'image/svg+xml').documentElement;const roots:Element[]=[];for(let i=0;i<4;i++){let ct=performance.now();const clone=prototype.cloneNode(true) as SVGSVGElement;w.phases.push({phase:'harness-preview-clone',start:ct,ms:performance.now()-ct});clone.setAttribute('width',String(size.widthPx));clone.setAttribute('height',String(size.heightPx));clone.style.cssText='position:absolute;left:0;top:0;opacity:0;pointer-events:none';document.body.appendChild(clone);clone.getBBox();roots.push(clone);t=performance.now();const canvas=document.createElement('canvas');canvas.width=Math.ceil(size.widthPx);canvas.height=Math.ceil(size.heightPx);document.body.appendChild(canvas);canvas.getContext('2d')!.fillRect(0,0,canvas.width,canvas.height);canvases.push(canvas);w.phases.push({phase:'texture-allocation',start:t,ms:performance.now()-t});await new Promise(r=>setTimeout(r,0));}canvases.forEach(c=>c.remove());roots.forEach(r=>r.remove());}
   }
  }catch(e){w.result={error:String(e)};}finally{w.done=true;}},150);},sample);
  const receipts:any[]=[],pending:Promise<void>[]=[];const base=clock.now();let sequence=0;
  const ping=()=>{const sent=clock.now(),id=sequence++;pending.push(page.evaluate(id=>{const button=document.getElementById('probe')!;button.click();return {id,at:performance.now()};},id).then(event=>{receipts.push({id,sent:sent-base,received:clock.now()-base,ms:clock.now()-sent,event});}));};
  ping();const timer=setInterval(ping,100);let cancelReceipt:any=null;
  if(sample.cancel){await new Promise(r=>setTimeout(r,300));const sent=clock.now();await page.locator('#cancel').click();cancelReceipt={sent:sent-base,ackMs:clock.now()-sent};}
  await page.waitForFunction(()=>(window as any).done,{},{timeout:90000,polling:100});if(cancelReceipt){cancelReceipt.stateMs=clock.now()-base-cancelReceipt.sent;const start=clock.now();cancelReceipt.reimport=await page.evaluate(async()=>{const w=window as any,p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><text font-size="8px">HIM</text></svg>'),'reimport.svg');return (await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:1,profileId:p.prepared.profileId,fontStatus:w.fontStatus},document.getElementById('stage'))).run;});cancelReceipt.reimportMs=clock.now()-start;}
  clearInterval(timer);await Promise.all(pending);
  const result=await page.evaluate(()=>{const w=window as any;return {result:w.result,phases:w.phases,probes:w.probes,events:w.events,remaining:document.getElementById('stage')!.children.length};});
  const times=receipts.map(r=>r.ms).sort((a,b)=>a-b),p95=times[Math.max(0,Math.ceil(times.length*.95)-1)]??0,max=times.at(-1)??0,syncMax=Math.max(0,...result.phases.filter((p:any)=>p.phase!=='measureSvg').map((p:any)=>p.ms)),timerExtra=Math.max(0,...result.probes.map((p:any)=>p.extra));
  const row={device,run,temperature:run===0?'cold':'warm',name:sample.name,expected:sample.expected,bytes:Buffer.byteLength(sample.xml),receipts,cancelReceipt,...result,summary:{p95,max,syncMax,timerExtra}};all.push(row);console.log(JSON.stringify({browser:device.browser,run,name:sample.name,...row.summary,result:row.result}));
  if(process.env.FIGURE_EVIDENCE_PREFIX)writeFileSync(process.env.FIGURE_EVIDENCE_PREFIX+'-'+info.project.name+'.json',JSON.stringify(all,null,2));
 }}
 for(const r of all){expect.soft(r.result.error,r.name).toBeUndefined();expect.soft(r.result.parseKind,r.name+' input status').toBe(r.expected);if(r.expected==='limited')expect.soft(r.phases.some((p:any)=>p.phase==='mount'),r.name+' no mounting').toBe(false);expect.soft(r.summary.p95,r.name+' receipt p95').toBeLessThanOrEqual(250);expect.soft(r.summary.max,r.name+' receipt max').toBeLessThanOrEqual(1000);expect.soft(r.summary.timerExtra,r.name+' timer extra').toBeLessThanOrEqual(500);expect.soft(r.summary.syncMax,r.name+' synchronous max').toBeLessThanOrEqual(500);if(r.result.measured)expect.soft(r.result.measured.elapsedMs,r.name+' measure').toBeLessThanOrEqual(16000);if(r.cancelReceipt){expect.soft(r.cancelReceipt.ackMs,r.name+' cancel ack').toBeLessThanOrEqual(1000);expect.soft(r.cancelReceipt.stateMs,r.name+' cancel state').toBeLessThanOrEqual(1000);expect.soft(r.cancelReceipt.reimport.status).toBe('complete');expect.soft(r.cancelReceipt.reimportMs).toBeLessThanOrEqual(1000);expect.soft(['cancelled','partial']).toContain(r.result.measured.run.status);}}
});
