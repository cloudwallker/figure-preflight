import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import AjvModule from 'ajv';
const svg=(body='',attrs='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 72" width="144pt" height="72pt" ${attrs}>${body}</svg>`;
async function parse(page:Page,xml:string,limits?:Record<string,number>){return page.evaluate(({xml,limits})=>{
 const w=window as any; if(!w.inputModule)throw Error('input API missing');
 const bytes=new TextEncoder().encode(xml),before=Array.from(bytes);
 const started=performance.now();const result=w.inputModule.parseSvg(bytes,'sample.svg',limits);w.lastParseMs=performance.now()-started;
 return {result,unchanged:JSON.stringify(before)===JSON.stringify(Array.from(bytes)),executed:!!w.EXECUTED};
},{xml,limits});}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('#ready')).toHaveText('ready');});
test('input API exists before any unsafe input reaches a DOM stage',async({page})=>{expect(await page.evaluate(()=>typeof (window as any).inputModule?.parseSvg)).toBe('function');});
for(const [name,body] of Object.entries({script:'<script>window.EXECUTED=true</script>',event:'<g onclick="window.EXECUTED=true"/>',foreign:'<foreignObject/>',image:'<image href="https://example.invalid/a"/>',external:'<use href="https://example.invalid/a"/>',data:'<use href="data:image/svg+xml,x"/>',blob:'<use href="blob:x"/>',font:'<style>@font-face{font-family:x;src:url(https://example.invalid/x)}</style>',escaped:'<g style="fill:u\\72l(https://example.invalid/x)"/>',comments:'<style>@im/**/port "https://example.invalid/x";</style>',metadata:'<metadata><g onload="window.EXECUTED=true"/></metadata>',unknownDanger:'<filter><g style="fill:url(https://example.invalid/x)"/></filter>'})){
 test('rejects '+name+' without execution or requests',async({page})=>{const requests:string[]=[];page.on('request',r=>requests.push(r.url()));const r=await parse(page,svg(body));expect(r.result.kind).toBe('rejected');expect(r.unchanged).toBe(true);expect(r.executed).toBe(false);expect(requests).toEqual([]);});
}
for(const [name,xml] of Object.entries({entity:'<!DOCTYPE svg [<!ENTITY x "boom">]>'+svg('<text>&x;</text>'),pi:'<?xml-stylesheet href="https://example.invalid/x"?>'+svg(),dtd:'<!DOCTYPE svg SYSTEM "https://example.invalid/x">'+svg()}))test('rejects prolog '+name,async({page})=>expect((await parse(page,xml)).result.kind).toBe('rejected'));
for(const [name,body] of Object.entries({filter:'<filter/>',css:'<path d="M0 0L1 1" style="paint-order:stroke"/>',variable:'<text style="font-size:var(--size)">A</text>',attribute:'<g data-object-id="o0"/>',selector:'<defs><style>text { fill: red }</style></defs>',namespace:'<q:thing xmlns:q="urn:safe"/>',rotate:'<text rotate="0 10">AB</text>'}))test('safe unknown disables whole preview '+name,async({page})=>{const r=(await parse(page,svg(body))).result;expect(r.kind).toBe('accepted');expect(r.prepared.preview).toEqual({status:'disabled',reasonCodes:['UNSUPPORTED_VISUAL_FEATURE']});});
for(const [name,xml] of Object.entries({duplicate:svg('<g id="x"/><g id="x"/>'),missing:svg('<use href="#x"/>'),wrong:svg('<defs><g id="x"/></defs><use href="#x"/>'),cycle:svg('<defs><use id="x" href="#x"/></defs>'),badpath:svg('<path d="M 0 nope"/>'),badfont:svg('<text style="font: broken">A</text>'),badopacity:svg('<g opacity="2"/>'),noviewbox:'<svg xmlns="http://www.w3.org/2000/svg"/>',broken:'<svg>'}))test('invalid '+name,async({page})=>expect((await parse(page,xml)).result.kind).toBe('invalid'));
test('fixed prolog is removed before parse; IDs and original hash remain stable',async({page})=>{
 const xml='<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'+svg('<metadata><x/></metadata><defs><path id="a:b" d="M0 0L1 1"/></defs><use href="#a:b"/>');
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 const a=await parse(page,xml),b=await parse(page,xml);expect(a).toEqual(b);expect(a.result.kind).toBe('accepted');expect(a.unchanged).toBe(true);expect(requests).toEqual([]);
 expect(a.result.prepared.inputSha256).toBe(createHash('sha256').update(xml).digest('hex'));
 expect(a.result.prepared.nodes.map((n:any)=>[n.objectId,n.sourcePath,n.retained])).toEqual([['o0','/0',true],['o1','/0/0',false],['o2','/0/0/0',false],['o3','/0/1',true],['o4','/0/1/0',true],['o5','/0/2',true]]);
 expect(a.result.prepared.sanitizedMarkup).toContain('href="#s-o4"');expect(a.result.prepared.sanitizedMarkup).not.toContain('metadata');
});
for(const [key,at,over,limit] of [
 ['maxInputBytes',svg(),svg(' '),new TextEncoder().encode(svg()).length],
 ['maxElements',svg('<g/>'),svg('<g/><g/>'),2],['maxDepth',svg('<g/>'),svg('<g><g/></g>'),2],
 ['maxAttributeBytes',svg('<g id="'+'a'.repeat(40)+'"/>'),svg('<g id="'+'a'.repeat(41)+'"/>'),40],
 ['maxPathBytes',svg('<path d="M0 0"/>'),svg('<path d="M0 0 "/>'),4],
 ['maxPathCommands',svg('<path d="M0 0L1 1"/>'),svg('<path d="M0 0L1 1L2 2"/>'),2],
 ['maxTextChars',svg('<text>abcd</text>'),svg('<text>abcde</text>'),4],
 ['maxUseInstances',svg('<defs><path id="x" d="M0 0"/></defs><use href="#x"/>'),svg('<defs><path id="x" d="M0 0"/></defs><use href="#x"/><use href="#x"/>'),1]
] as const)test('limit '+key+' exact and plus one',async({page})=>{expect((await parse(page,at,{[key]:limit})).result.kind).toBe('accepted');expect((await parse(page,over,{[key]:limit})).result.kind).toBe('limited');});
test('actual fixed Matplotlib exports retain visible text, clips and use',async({page})=>{
 for(const name of ['01-bad.svg','02-fixed.svg','03-144pt.svg']){const xml=readFileSync('fixtures/'+name,'utf8');const r=await parse(page,xml);expect(r.result.kind,name).toBe('accepted');expect(r.result.prepared.preview.status,name).toBe('enabled');expect(r.result.prepared.sanitizedMarkup).toContain('<text');expect(r.unchanged).toBe(true);}
});
test('actual input outcomes satisfy the frozen shared JSON schema',async({page},info)=>{
 const schema=JSON.parse(readFileSync('schemas/figure-report-v1.schema.json','utf8'));
 schema.$ref='#/definitions/ParseOutcome';const Ajv=(AjvModule as any).default??AjvModule;const validate=new Ajv({strict:false,strictNumbers:true}).compile(schema);
 const outcomes=[];
 for(const xml of [svg('<text font-size="8">HIM</text>'),svg('<filter/>'),svg('<script/>'),'<svg>',svg('<g/><g/>')]){
  const r=(await parse(page,xml,xml.includes('<g/>')?{maxElements:2}:undefined)).result;expect(validate(r),JSON.stringify(validate.errors)).toBe(true);outcomes.push(r);
 }
 expect(outcomes.map(r=>r.kind)).toEqual(['accepted','accepted','rejected','invalid','limited']);
 await info.attach('shared-parse-outcomes',{body:JSON.stringify(outcomes,null,2),contentType:'application/json'});
});
test('mixed text/tspan source ordering is preserved',async({page})=>{
 const r=(await parse(page,svg('<text>A<tspan>B</tspan>C<tspan>D</tspan>E</text>'))).result;
 expect(r.kind).toBe('accepted');
 const text=await page.evaluate(markup=>new DOMParser().parseFromString(markup,'image/svg+xml').getElementsByTagName('text')[0].textContent,r.prepared.sanitizedMarkup);
 expect(text).toBe('ABCDE');
});
test('dangerous input overrides otherwise invalid duplicate IDs',async({page})=>expect((await parse(page,svg('<g id="a"/><g id="a"/><script/>'))).result.kind).toBe('rejected'));
test('unsupported style attributes and namespaces disable; invalid style type is invalid',async({page})=>{
 for(const xml of [svg('<defs><style media="screen">*{stroke-linejoin:round;stroke-linecap:butt}</style></defs>'),svg('','xmlns:q="urn:unknown"')])expect((await parse(page,xml)).result.prepared.preview.status).toBe('disabled');
 expect((await parse(page,svg('<defs><style type="something">*{stroke-linejoin:round;stroke-linecap:butt}</style></defs>'))).result.kind).toBe('invalid');
});
for(const key of ['stroke-width','stroke-dasharray','stroke-dashoffset'])test('SVG stroke domain '+key,async({page})=>{
 const valid=key==='stroke-dasharray'?['0','0.15 2','1pt, 2mm']:['0','0.15','1pt'];if(key==='stroke-dashoffset')valid.push('-0.15','-1pt');
 for(const value of valid)for(const attr of [key+'="'+value+'"','style="'+key+':'+value+'"']){const r=(await parse(page,svg('<path d="M0 0L1 1" '+attr+'/>'))).result;expect(r.kind,attr).toBe('accepted');expect(r.prepared.preview.status,attr).toBe('enabled');}
 for(const value of ['1%','2em'])expect((await parse(page,svg('<path style="'+key+':'+value+'"/>'))).result.prepared.preview.status).toBe('disabled');
 for(const value of ['NaN','Infinity','1garbage',...(key!=='stroke-dashoffset'?['-1']:[])])expect((await parse(page,svg('<path style="'+key+':'+value+'"/>'))).result.kind,value).toBe('invalid');
});
test('inline declarations outrank presentation and fixed stylesheet outranks presentation',async({page})=>{
 const r=(await parse(page,svg('<defs><style>*{stroke-linejoin:round;stroke-linecap:butt}</style></defs><path d="M0 0L1 1" style="stroke-width:2;stroke-linejoin:bevel" stroke-width="1" stroke-linecap="round"/>'))).result;
 expect(r.kind).toBe('accepted');
 const attrs=await page.evaluate(markup=>{const el=new DOMParser().parseFromString(markup,'image/svg+xml').getElementsByTagName('path')[0];return ['stroke-width','stroke-linejoin','stroke-linecap'].map(k=>el.getAttribute(k));},r.prepared.sanitizedMarkup);
 expect(attrs).toEqual(['2','bevel','butt']);
});
test('malformed path separators and position lists are not silently repaired',async({page})=>{
 for(const body of ['<path d="M,0 0"/>','<path d="M0,,0"/>','<path d="M0 0,"/>','<text x="1,,2">AB</text>','<path style="stroke-dasharray:1,,2"/>'])expect((await parse(page,svg(body))).result.kind,body).toBe('invalid');
});
test('trailing path command and clipping through inline style are invalid',async({page})=>{
 for(const body of ['<path d="M0 0L"/>','<path d="M"/>','<defs><clipPath id="c"><path d="M0 0L1 1" style="clip-path:url(#c)"/></clipPath></defs><g clip-path="url(#c)"/>'])expect((await parse(page,svg(body))).result.kind,body).toBe('invalid');
});
test('CDATA comment-like text remains literal and invalid XML comments remain invalid',async({page})=>{
 const r=(await parse(page,svg('<text><![CDATA[A<!--B-->C]]></text>'))).result;expect(r.kind).toBe('accepted');expect(r.prepared.sanitizedMarkup).toContain('A&lt;!--B--&gt;C');
 expect((await parse(page,svg('<!--bad--comment-->'))).result.kind).toBe('invalid');
});
test('production upper bounds and plus-one inputs are checked before rendering',async({page},testInfo)=>{
 test.setTimeout(120000);
 const cases:Array<[string,string,string]>=[
 ['bytes',svg('<!--'+' '.repeat(10485760-new TextEncoder().encode(svg('<!---->')).length)+'-->'),svg('<!--'+' '.repeat(10485761-new TextEncoder().encode(svg('<!---->')).length)+'-->')],
 ['elements',svg('<g/>'.repeat(19999)),svg('<g/>'.repeat(20000))],
 ['depth',svg('<g>'.repeat(63)+'</g>'.repeat(63)),svg('<g>'.repeat(64)+'</g>'.repeat(64))],
 ['attribute',svg('<g id="'+'a'.repeat(65536)+'"/>'),svg('<g id="'+'a'.repeat(65537)+'"/>')],
 ['pathBytes',svg('<path d="M0 0'+' '.repeat(2097152-4)+'"/>'),svg('<path d="M0 0'+' '.repeat(2097153-4)+'"/>')],
 ['commands',svg('<path d="M0 0'+'L1 1'.repeat(99999)+'"/>'),svg('<path d="M0 0'+'L1 1'.repeat(100000)+'"/>')],
 ['text',svg('<text>'+'A'.repeat(1048576)+'</text>'),svg('<text>'+'A'.repeat(1048577)+'</text>')],
 ['use',svg('<defs><path id="x" d="M0 0"/></defs>'+'<use href="#x"/>'.repeat(5000)),svg('<defs><path id="x" d="M0 0"/></defs>'+'<use href="#x"/>'.repeat(5001))]
 ];
 for(const [name,at,over] of cases){const start=Date.now();const a=await parse(page,at),parseMs=await page.evaluate(()=>(window as any).lastParseMs),b=await parse(page,over);expect(a.result.kind,name+JSON.stringify(a.result.diagnostics)).toBe(['bytes','elements','text','pathBytes','commands','use'].includes(name)?'limited':'accepted');expect(b.result.kind,name).toBe('limited');console.log(JSON.stringify({browser:testInfo.project.name,boundary:name,atBytes:new TextEncoder().encode(at).length,parseMs,elapsedDriverMs:Date.now()-start,unchanged:a.unchanged&&b.unchanged}));}
});
test('measured responsiveness caps reject oversized bytes, element count and text before stage creation',async({page})=>{
 const at=[svg('<!--'+' '.repeat(2097152-new TextEncoder().encode(svg('<!---->')).length)+'-->'),svg('<g/>'.repeat(4095)),svg('<text>'+'H'.repeat(131072)+'</text>')];
 const over=[at[0]+' ',svg('<g/>'.repeat(4096)),svg('<text>'+'H'.repeat(131073)+'</text>')];
 for(let i=0;i<at.length;i++){expect((await parse(page,at[i])).result.kind).toBe('accepted');expect((await parse(page,over[i])).result.kind).toBe('limited');}
});
test('text cap counts UTF-16 code units including supplementary characters',async({page})=>{
 expect((await parse(page,svg('<text>'+'\u{1f600}'.repeat(65536)+'</text>'))).result.kind).toBe('accepted');
 expect((await parse(page,svg('<text>'+'\u{1f600}'.repeat(65536)+'A</text>'))).result.kind).toBe('limited');
});
