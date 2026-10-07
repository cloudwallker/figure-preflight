import {test,expect} from '@playwright/test';
test('synchronous current 2 MiB accepted input stays below the local 500ms gate',async({page},info)=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const timings=await page.evaluate(async()=>{
  const w=window as any;const hash=await import('/hash.js' as string);
  const start='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><!--',end='--></svg>';
  const xml=start+' '.repeat(2097152-start.length-end.length)+end,bytes=new TextEncoder().encode(xml),result=[];
  for(let i=0;i<3;i++){
   let t=performance.now();const p=w.inputModule.parseSvg(bytes,'synthetic.svg');const parseMs=performance.now()-t;
   t=performance.now();hash.sha256(bytes);const hashMs=performance.now()-t;
   t=performance.now();xml.replace(/<!--[\s\S]*?-->/g,'');const commentRegexMs=performance.now()-t;
   result.push({run:i,kind:p.kind,parseMs,hashMs,commentRegexMs});
  }return result;
 });
 console.log(JSON.stringify({browser:info.project.name,timings}));
 for(const t of timings){expect(t.kind).toBe('accepted');expect(t.parseMs).toBeLessThanOrEqual(500);}
});
