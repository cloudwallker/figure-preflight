import {test} from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
test('generator produces deterministic actual text SVG and independently specified physical truth',()=>{
 assert.ok(existsSync('tools/generate_fixtures.py'),'real generator must exist');
 const temp=mkdtempSync(join(tmpdir(),'figure-fixtures-'));
 try{const p=spawnSync(process.env.FIGURE_PYTHON??'.venv/Scripts/python.exe',['tools/generate_fixtures.py','--output',temp],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 for(const f of ['01-bad.svg','02-fixed.svg','03-144pt.svg','expected.json','profile-observed.json'])assert.equal(readFileSync(join(temp,f),'utf8'),readFileSync('fixtures/'+f,'utf8'),f+' reproducible');
 const bad=readFileSync(join(temp,'01-bad.svg'),'utf8');for(const id of ['small-label-a','small-label-b','small-legend','thin-line'])assert.ok(bad.includes('id="'+id+'"'),id);
 assert.match(bad,/<text /);assert.match(bad,/<clipPath /);assert.match(bad,/<use /);assert.match(bad,/<!DOCTYPE svg PUBLIC/);assert.match(bad,/stroke-linejoin: round; stroke-linecap: butt/);
 assert.equal((bad.match(/stroke-width: 0\.15(?:;|")/g)??[]).length,1,'the real legend handle must not add a second injected thin stroke');
 const known=readFileSync(join(temp,'03-144pt.svg'),'utf8');assert.match(known,/width="144pt" height="72pt" viewBox="0 0 144 72"/);assert.match(known,/<text /);
 const ex=JSON.parse(readFileSync(join(temp,'expected.json'),'utf8'));assert.equal(ex.profile.matplotlib,'3.9.4');assert.equal(ex.files['03-144pt.svg'].at50_8mm.fontPt,8);assert.equal(ex.files['03-144pt.svg'].at25_4mm.fontPt,4);assert.equal(ex.files['01-bad.svg'].sha256,createHash('sha256').update(bad).digest('hex'));
 for(const [name,expected] of Object.entries(ex.files)){const actual=readFileSync('fixtures/'+name);assert.equal(createHash('sha256').update(actual).digest('hex'),expected.sha256,name+' hash');assert.equal(actual.toString(),readFileSync(join(temp,name),'utf8'),name+' reproducible');}
 const ref=spawnSync(process.env.FIGURE_PYTHON??'.venv/Scripts/python.exe',['tools/reference_text_bounds.py','--fixtures',temp,'--output',temp],{encoding:'utf8'});assert.equal(ref.status,0,ref.stderr);
 for(const file of ['text-reference.json','manifest.json'])assert.equal(readFileSync(join(temp,file),'utf8'),readFileSync('fixtures/'+file,'utf8'),file+' independent reference reproducible');
 const manifest=JSON.parse(readFileSync('fixtures/manifest.json','utf8'));assert.equal(manifest.actualFileCount,39);assert.equal(manifest.measurementAcceptanceIds.length,20);assert.equal(new Set(manifest.entries.filter(e=>e.measurementAcceptanceIds.length).map(e=>e.sha256)).size,20);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('counterexample parameter produces actual outline glyphs and a real mixed scene',()=>{
 const temp=mkdtempSync(join(tmpdir(),'figure-counterexamples-'));
 try{const p=spawnSync(process.env.FIGURE_PYTHON??'.venv/Scripts/python.exe',['tools/generate_fixtures.py','--output',temp,'--include-counterexamples'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 const outline=readFileSync(join(temp,'11-outline.svg'),'utf8'),mixed=readFileSync(join(temp,'12-mixed.svg'),'utf8');
 assert.doesNotMatch(outline,/<text(?:\s|>)/);assert.match(outline,/DejaVuSans-48/);assert.match(outline,/<use /);
 assert.match(mixed,/<text(?:\s|>)/);assert.match(mixed,/mixed-DejaVuSans-48/);assert.match(mixed,/<use /);assert.match(mixed,/>ABC<\/text>/);
 for(const href of mixed.matchAll(/xlink:href="#([^"]+)"/g))assert.ok(mixed.includes('id="'+href[1]+'"'),'actual glyph reference resolves');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
