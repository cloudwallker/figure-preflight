import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
test('synchronous source hash matches standard SHA-256 across block boundaries',async()=>{
 const api=await import('../src/sha256.ts').catch(()=>null);assert.ok(api,'synchronous hash must exist');
 for(const n of [0,1,55,56,63,64,65,1000,10485760]){const b=new Uint8Array(n).fill(97);assert.equal(api.sha256(b),createHash('sha256').update(b).digest('hex'));}
});
