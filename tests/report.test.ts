import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exampleReport} from './contract.test.ts';
import type {PreparedSvg} from '../src/model.ts';

test('report consumer preserves partial dual roles and strips filename paths without leaking text',async()=>{
 const api=await import('../src/report.ts').catch(()=>null);assert.ok(api,'report consumer must exist');
 const measured=exampleReport().measurement;measured.run={status:'partial',stopReason:'cancelled'};
 measured.objects[0].finalPt=5;measured.objects[0].finalMm=5*25.4/72;
 measured.objects.push({...measured.objects[0],kind:'stroke',finalPt:.1,finalMm:.1*25.4/72});
 measured.coverage.stroke={discovered:2,measured:1,unassessed:0,excluded:0,pending:1};measured.coverage.enumerationComplete=false;
 const prepared:PreparedSvg={profileId:measured.profileId,resourceCost:{expandedVectorCommands:0,drawWeight:0},sanitizedMarkup:'<svg>PRIVATE TEXT</svg>',rootGeometry:{viewBox:{x:0,y:0,width:144,height:72},originalWidthPx:192,originalHeightPx:96,preserveAspectRatio:'xMidYMid meet',aspectBasis:'root-dimensions'},nodes:[{objectId:'o1',ordinal:1,sourcePath:'/0/0',sourceId:null,tag:'text',sanitizedId:'s-o1',retained:true}],diagnostics:[],inputSha256:'a'.repeat(64),label:'C:\\private\\chart.svg',preview:{status:'enabled',reasonCodes:[]}};
 const report=api.buildReport(prepared,measured,{minFontPt:6,minStrokePt:.25},{status:'needs-change',note:'</script><img src=x onerror=alert(1)>\u2028\u2029'});
 assert.equal(report.source.label,'chart.svg');assert.equal(report.measurement.run.status,'partial');assert.equal(report.findings.length,2);
 const json=api.serializeJson(report);assert.doesNotMatch(json,/[<\u2028\u2029]/);assert.doesNotMatch(json,/PRIVATE TEXT|C:\\\\private/);assert.deepEqual(JSON.parse(json),report);
 measured.objects[0].finalPt=99;assert.equal(report.measurement.objects.find(o=>o.kind==='text')!.finalPt,5,'snapshot detached from producer');
});
test('HTML embeds a detached saved snapshot under CSP and never interpolates user strings into markup',async()=>{
 const api=await import('../src/report.ts');assert.equal(typeof (api as any).renderHtml,'function');
 const report=exampleReport();report.preview={status:'disabled',reasonCodes:['UNSUPPORTED_VISUAL_FEATURE']};report.source.label='</title><script>globalThis.hacked=1</script>.svg';report.manualReview.note='</script><svg onload=globalThis.hacked=2>';
 const prepared:any={profileId:report.source.profileId,label:report.source.label,inputSha256:report.source.inputSha256,preview:report.preview,resourceCost:{expandedVectorCommands:0,drawWeight:0},sanitizedMarkup:'<svg xmlns="http://www.w3.org/2000/svg"/>',nodes:[],rootGeometry:{viewBox:{x:0,y:0,width:1,height:1},originalWidthPx:1,originalHeightPx:1,preserveAspectRatio:'xMidYMid meet',aspectBasis:'viewBox'},diagnostics:[]};
 prepared.nodes.push({objectId:'o1',ordinal:1,sourcePath:'/0/0',sourceId:'PRIVATE_METADATA',tag:'metadata',sanitizedId:null,retained:false});
 const html=(api as any).renderHtml(report,prepared,{appJs:'globalThis.offlineBoot=true;',css:'body{color:black}',font:{family:'DejaVu Sans',version:'2.35',base64:'',sha256:'a'.repeat(64),licenseRef:'assets/LICENSE_DEJAVU'}});
 assert.match(html,/Content-Security-Policy/);assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script>globalThis.hacked|<svg onload/);assert.match(html,/\\u003c\/script>/);
 assert.doesNotMatch(html,/PRIVATE_METADATA/);
});
