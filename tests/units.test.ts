import {test} from 'node:test';
import assert from 'node:assert/strict';
test('units API exists and maps absolute lengths without truncating invalid suffixes',async()=>{
 const api=await import('../src/units.ts').catch(()=>null); assert.ok(api,'units module must exist');
 for(const raw of ['144pt','50.8mm','2in','5.08cm','192px','192']) {const r=api.parseAbsoluteLength(raw,'root');assert.equal(r.kind,'valid');if(r.kind==='valid')assert.equal(r.cssPx,192);}
 for(const raw of ['0','-1','1%','1em','calc(2px)','NaN','Infinity','1foo','1px junk'])assert.equal(api.parseAbsoluteLength(raw,'root').kind,'unassessed');
 assert.equal(api.parseAbsoluteLength('8','css').kind,'unassessed');
 const r=api.parseAbsoluteLength('8','presentation');assert.equal(r.kind,'valid');if(r.kind==='valid')assert.equal(r.cssPx,8);
});
test('viewport uses pt root geometry, translations and preserveAspectRatio',async()=>{
 const api=await import('../src/units.ts').catch(()=>null); assert.ok(api,'units module must exist');
 assert.deepEqual(api.viewportTransform({x:0,y:0,width:144,height:72},192,96,'xMidYMid meet'),{a:4/3,b:0,c:0,d:4/3,e:0,f:0});
 assert.deepEqual(api.viewportTransform({x:10,y:20,width:100,height:50},200,200,'xMidYMid meet'),{a:2,b:0,c:0,d:2,e:-20,f:10});
 assert.deepEqual(api.viewportTransform({x:10,y:20,width:100,height:50},200,200,'xMaxYMax slice'),{a:4,b:0,c:0,d:4,e:-240,f:-80});
 assert.deepEqual(api.viewportTransform({x:10,y:20,width:100,height:50},200,200,'none'),{a:2,b:0,c:0,d:4,e:-20,f:-80});
 assert.throws(()=>api.viewportTransform({x:0,y:0,width:0,height:2},2,2,'none'));
});
test('similarity allows reflection and refuses skew, nonfinite and singular',async()=>{
 const api=await import('../src/units.ts').catch(()=>null); assert.ok(api,'units module must exist');
 assert.deepEqual(api.classifySimilarity({a:-2,b:0,c:0,d:2,e:0,f:0}),{kind:'similarity',scale:2});
 for(const m of [{a:1,b:0,c:1,d:1,e:0,f:0},{a:0,b:0,c:0,d:1,e:0,f:0},{a:1,b:0,c:0,d:1,e:Infinity,f:0}])assert.equal(api.classifySimilarity(m).kind,'unassessed');
});
test('finite extreme matrices never overflow or underflow into a false similarity',async()=>{
 const api=await import('../src/units.ts');
 assert.deepEqual(api.classifySimilarity({a:1e308,b:0,c:0,d:1e308,e:0,f:0}),{kind:'similarity',scale:1e308});
 assert.equal(api.classifySimilarity({a:1e308,b:0,c:7e307,d:7e307,e:0,f:0}).kind,'unassessed');
 assert.deepEqual(api.classifySimilarity({a:1e-200,b:0,c:0,d:1e-200,e:0,f:0}),{kind:'similarity',scale:1e-200});
});
for(const [name,box,width,height] of [
 ['division overflow',{x:0,y:0,width:1e-320,height:1e-320},192,192],
 ['translation overflow',{x:1e308,y:0,width:1,height:1},192,192],
 ['scale underflow',{x:0,y:0,width:1e308,height:1e308},1e-320,1e-320]
] as const)test('viewport rejects '+name+' from finite inputs',async()=>{
 const {viewportTransform}=await import('../src/units.ts');
 for(const par of ['none','xMidYMid meet','xMaxYMax slice'])assert.throws(()=>viewportTransform(box,width,height,par),/Unrepresentable viewport/);
});
