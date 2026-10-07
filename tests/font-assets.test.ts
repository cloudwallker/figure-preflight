import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('distributed font bytes, embedded bytes, cmap and independent reference share the pinned licensed face',()=>{
 const assets=JSON.parse(readFileSync('assets/font-assets.json','utf8')),coverage=JSON.parse(readFileSync('assets/font-coverage.json','utf8')),ref=JSON.parse(readFileSync('fixtures/text-reference.json','utf8')),ttf=readFileSync('assets/DejaVuSans.ttf');
 assert.equal(createHash('sha256').update(ttf).digest('hex'),'3fdf69cabf06049ea70a00b5919340e2ce1e6d02b0cc3c4b44fb6801bd1e0d22');assert.deepEqual(Buffer.from(assets.base64,'base64'),ttf);assert.equal(coverage.sha256,assets.sha256);assert.equal(ref.fontSha256,assets.sha256);
 assert.match(readFileSync(assets.licenseRef,'utf8'),/Bitstream Vera Fonts Copyright/);assert.ok(coverage.codepoints.includes(72));assert.ok(!coverage.codepoints.includes(0x4e2d));assert.ok(coverage.names.every((n:string)=>n==='Version 2.35'));
});
