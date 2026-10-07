import {test,expect,type Page} from '@playwright/test';
const svg=(body:string,box='0 0 10 10',size='width="10px" height="10px"')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" ${size}>${body}</svg>`;
async function inspect(page:Page,xml:string){
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 const result=await page.evaluate(xml=>{const bytes=new TextEncoder().encode(xml),before=bytes.slice();const result=(window as any).inputModule.parseSvg(bytes,'review.svg');return {result,unchanged:bytes.every((b,i)=>b===before[i]),executed:!!(window as any).EXECUTED};},xml);
 expect(requests).toEqual([]);expect(result.unchanged).toBe(true);expect(result.executed).toBe(false);return result.result;
}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');});
for(const mode of ['presentation','inline'])for(const kind of ['self','mutual','acyclic'])test(`review I1 rejects ${mode} ${kind} clipPath definition references`,async({page})=>{
 const clip=(id:string,target:string|null)=>`<clipPath id="${id}" ${target?(mode==='inline'?`style="clip-path:url(#${target})"`:`clip-path="url(#${target})"`):''}><rect width="5" height="5"/></clipPath>`;
 const body=kind==='self'?clip('a','a'):clip('a','b')+clip('b',kind==='mutual'?'a':null);
 const r=await inspect(page,svg('<defs>'+body+'</defs><path d="M0 0L5 5" clip-path="url(#a)"/>'));
 expect(r.kind).toBe('invalid');expect(r.diagnostics[0].code).toBe('CLIP_DEFINITION_REFERENCE');
});
test('review I1 keeps supported geometric clipping',async({page})=>{
 const r=await inspect(page,svg('<defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs><path d="M0 0L5 5" clip-path="url(#c)"/>'));
 expect(r.kind).toBe('accepted');expect(r.prepared.preview.status).toBe('enabled');expect(r.prepared.sanitizedMarkup).toContain('clip-path="url(#s-o2)"');
});
for(const attr of ['clip-path="inherit"','style="clip-path:inherit"'])test('review I1 inherited definition references are also outside the grammar '+attr,async({page})=>{
 const r=await inspect(page,svg(`<defs clip-path="url(#c)"><clipPath id="c" ${attr}><rect width="5" height="5"/></clipPath></defs>`));
 expect(r.kind).toBe('invalid');expect(r.diagnostics[0].code).toBe('CLIP_DEFINITION_REFERENCE');
});
for(const parent of ['metadata','title','desc'])test('review I2 removed '+parent+' style does not alter visible strokes',async({page})=>{
 const path='<path d="M0 0L5 5" stroke-linejoin="bevel" stroke-linecap="square"/>';
 const attrs=async(markup:string)=>page.evaluate(markup=>{const p=new DOMParser().parseFromString(markup,'image/svg+xml').getElementsByTagName('path')[0];return [p.getAttribute('stroke-linejoin'),p.getAttribute('stroke-linecap')];},markup);
 const control=await inspect(page,svg(path));
 for(const style of ['<style/>','<defs><style>*{stroke-linejoin:round;stroke-linecap:butt}</style></defs>']){
  const r=await inspect(page,svg(`<${parent}>${style}</${parent}>`+path));expect(r.kind).toBe('accepted');expect(r.prepared.preview.status).toBe('enabled');expect(await attrs(r.prepared.sanitizedMarkup)).toEqual(await attrs(control.prepared.sanitizedMarkup));
 }
 expect(await attrs(control.prepared.sanitizedMarkup)).toEqual(['bevel','square']);
});
for(const [name,box,size] of [
 ['division','0 0 1e-320 1e-320','width="192px" height="192px"'],
 ['translation','1e308 0 1 1','width="192px" height="192px"'],
 ['underflow','0 0 1e308 1e308','width="1e-320px" height="1e-320px"']
] as const)test('review I3 rejects unrepresentable '+name+' viewport',async({page})=>{
 const r=await inspect(page,svg('',box,size));expect(r.kind).toBe('invalid');expect(r.diagnostics[0].code).toBe('VIEWPORT_GEOMETRY');
});
test('review I4 preserves full-tree danger priority through removed and unknown nodes',async({page})=>{
 for(const wrapper of ['metadata','title','desc','filter'])for(const danger of ['<g onload="window.EXECUTED=true"/>','<g style="fill:u\\72l(https://example.invalid/x)"/>','<style>@im/**/port "https://example.invalid/x";</style>']){
  const r=await inspect(page,svg('<g id="duplicate"/><g id="duplicate"/>'+`<${wrapper}>${danger}</${wrapper}>`));expect(r.kind).toBe('rejected');
 }
});
