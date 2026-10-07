import {test,expect} from '@playwright/test';
test('trusted bytes load with pinned identity; corrupt bytes cannot claim loaded',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async()=>{const w=window as any;if(!w.fontModule)return {error:w.fontError};const a=await(await fetch('/font-assets.json')).json();
 const corrupt=await w.fontModule.loadTrustedFont({...a,base64:a.base64.slice(10)});const good=await w.fontModule.loadTrustedFont(a);
 return {corrupt,good,count:document.fonts.size};});
 expect(result.error).toBeUndefined();expect(result.corrupt.status).toBe('unavailable');expect(result.good.status).toBe('loaded');expect(result.good.reasonCodes).toEqual([]);expect(result.count).toBe(1);
});
test('actual loaded font marks ASCII exact and missing CJK or styled face approximate',async({page})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');
 const result=await page.evaluate(async()=>{const w=window as any;if(!w.fontModule)return {error:w.fontError};const a=await(await fetch('/font-assets.json')).json(),fontStatus=await w.fontModule.loadTrustedFont(a);
 const p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72" stroke="black" stroke-width=".1"><text x="10" y="20" font-family="DejaVu Sans" font-size="8px">HIM</text><text x="10" y="40" font-family="DejaVu Sans" font-size="8px">中文</text><text x="80" y="40" font-family="DejaVu Sans" font-size="8px" font-weight="bold">HIM</text></svg>'),'font.svg');
 const r=await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:1,profileId:p.prepared.profileId,fontStatus},document.getElementById('stage'));
 return {objects:r.objects};});
 expect(result.error).toBeUndefined();expect(result.objects.map((o:any)=>o.locationAccuracy)).toEqual(['exact-environment','exact-environment','approximate','approximate','approximate','approximate']);
 expect(result.objects.every((o:any)=>Math.abs(o.finalPt-(o.kind==='text'?8:.1))<.01)).toBe(true);
 for(const i of [2,3])expect(result.objects[i].reasonCodes).toContain('FONT_GLYPH_UNVERIFIED');for(const i of [4,5])expect(result.objects[i].reasonCodes).toContain('FONT_FACE_UNVERIFIED');
});
test('trusted font and measurement operate offline with no resource request',async({page,context})=>{
 await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');const assets=await page.evaluate(async()=>await(await fetch('/font-assets.json')).json());const requests:string[]=[];page.on('request',r=>requests.push(r.url()));await context.setOffline(true);
 const result=await page.evaluate(async(a)=>{const w=window as any,status=await w.fontModule.loadTrustedFont(a);const p=w.inputModule.parseSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72"><text font-family="DejaVu Sans" font-size="8px">HIM</text></svg>'),'offline.svg');return {status,report:await w.measureModule.measureSvg(p.prepared,{widthMm:50.8,revision:0,profileId:p.prepared.profileId,fontStatus:status},document.getElementById('stage'))};},assets);
 expect(result.status.status).toBe('loaded');expect(result.report.run.status).toBe('complete');expect(result.report.objects[0].locationAccuracy).toBe('exact-environment');expect(requests).toEqual([]);
});
