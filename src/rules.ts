import type {Finding,MeasurementReport,Thresholds} from './model.ts';
export function evaluateThresholds(report:MeasurementReport,thresholds:Thresholds):Finding[]{
 const {minFontPt:f,minStrokePt:s}=thresholds;
 if(!Number.isFinite(f)||f<1||f>72||!Number.isFinite(s)||s<.01||s>10)throw new RangeError('Invalid thresholds');
 return report.objects.filter(o=>o.status==='measured'&&o.finalPt!==null&&o.finalPt<(o.kind==='text'?f:s)-1e-6).map(o=>({
  id:o.objectId+':'+(o.kind==='text'?'SMALL_TEXT':'THIN_STROKE'),objectId:o.objectId,ruleId:o.kind==='text'?'SMALL_TEXT':'THIN_STROKE',actualPt:o.finalPt!,thresholdPt:o.kind==='text'?f:s,bounds:o.bounds,
  reason:o.kind==='text'?'Supported retained text is below the final-size font threshold.':'Supported nominal stroke is below the final-size stroke threshold.'}));
}
