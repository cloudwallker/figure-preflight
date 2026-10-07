import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {MeasurementReport,ObjectMeasurement} from '../src/model.ts';
const object=(kind:'text'|'stroke',finalPt:number,status='measured')=>({objectId:kind,kind,finalPt,status,bounds:null}) as ObjectMeasurement;
test('thresholds preserve full precision, equality, unknown and partial results',async()=>{
 const api=await import('../src/rules.ts').catch(()=>null);assert.ok(api,'rules module missing');
 const r={objects:[object('text',6),object('stroke',.25)]} as MeasurementReport;
 assert.deepEqual(api.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}),[]);
 r.objects=[object('text',5.99),object('stroke',.249),object('text',0,'unassessed')];
 assert.deepEqual(api.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}).map(x=>x.actualPt),[5.99,.249]);
 assert.equal(api.evaluateThresholds(r,{minFontPt:5,minStrokePt:.2}).length,0);
 r.objects=[object('text',5.9999995)];assert.equal(api.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}).length,0);
 for(const t of [{minFontPt:0,minStrokePt:.25},{minFontPt:73,minStrokePt:.25},{minFontPt:6,minStrokePt:0},{minFontPt:6,minStrokePt:11},{minFontPt:NaN,minStrokePt:.25}])assert.throws(()=>api.evaluateThresholds(r,t),RangeError);
 r.objects=[];assert.deepEqual(api.evaluateThresholds(r,{minFontPt:6,minStrokePt:.25}),[]);
});
