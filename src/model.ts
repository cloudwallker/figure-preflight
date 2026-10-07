
export type Matrix6 = {a:number;b:number;c:number;d:number;e:number;f:number};
export type ViewBox = {x:number;y:number;width:number;height:number};
export type Bounds = {x:number;y:number;width:number;height:number}; // 最终viewport归一化，允许越界，宽高>=0
export type Diagnostic = {code:string;level:'error'|'unassessed'|'info';sourcePath:string|null;message:string};
export type RootGeometry = {viewBox:ViewBox;originalWidthPx:number|null;originalHeightPx:number|null;
 preserveAspectRatio:string;aspectBasis:'root-dimensions'|'viewBox'};
export type Capability = {status:'enabled';reasonCodes:[]}|{status:'disabled';reasonCodes:string[]};
export type SourceNode = {objectId:string;ordinal:number;sourcePath:string;sourceId:string|null;
 tag:string;sanitizedId:string|null;retained:boolean};
export type ResourceCost = {readonly expandedVectorCommands:number;readonly drawWeight:number};
export type PreparedSvg = {profileId:'matplotlib-text-svg-v1';sanitizedMarkup:string;rootGeometry:RootGeometry;readonly resourceCost:ResourceCost;
 nodes:SourceNode[];diagnostics:Diagnostic[];inputSha256:string;label:string;preview:Capability};
export type ParseOutcome = {kind:'accepted';prepared:PreparedSvg}|
 {kind:'invalid'|'rejected'|'limited';diagnostics:Diagnostic[]};
export type TrustedFontAssets = {family:string;version:string;base64:string;sha256:string;licenseRef:string};
export type TrustedAssets = {appJs:string;css:string;font:TrustedFontAssets};
export type FontStatus = {status:'loaded'|'unavailable';family:string;version:string;sha256:string;
 licenseRef:string;reasonCodes:string[]};
export type MeasureOptions = {widthMm:number;profileId:'matplotlib-text-svg-v1';revision:number;fontStatus:FontStatus};
export type FinalSize = {widthMm:number;heightMm:number;widthPx:number;heightPx:number};
export type Environment = {toolVersion:string;browserName:string;browserVersion:string;platform:string;
 devicePixelRatio:number;font:FontStatus};
export type ObjectMeasurement = {objectId:string;sourcePath:string;sourceId:string|null;kind:'text'|'stroke';
 status:'measured'|'unassessed'|'excluded';localValue:number|null;matrix:Matrix6|null;
 finalPt:number|null;finalMm:number|null;bounds:Bounds|null;
 locationAccuracy:'exact-environment'|'approximate'|'unavailable';reasonCodes:string[]};
export type Counts = {discovered:number;measured:number;unassessed:number;excluded:number;pending:number};
export type Coverage = {enumerationComplete:boolean;text:Counts;stroke:Counts;
 textCompleteness:'retained-text-only';possibleOutline:boolean;reasonCodes:string[]};
export type RunState = {status:'complete';stopReason:null}|
 {status:'partial';stopReason:'cancelled'|'timeout'|'engine-error'}|
 {status:'cancelled'|'timeout'|'engine-error'|'limited';stopReason:string};
export type MeasurementReport = {revision:number;profileId:'matplotlib-text-svg-v1';run:RunState;
 finalSize:FinalSize|null;environment:Environment;objects:ObjectMeasurement[];coverage:Coverage;
 diagnostics:Diagnostic[];elapsedMs:number};
export type Thresholds = {minFontPt:number;minStrokePt:number};
export type Finding = {id:string;objectId:string;ruleId:'SMALL_TEXT'|'THIN_STROKE';actualPt:number;
 thresholdPt:number;bounds:Bounds|null;reason:string};
export type ManualReview = {status:'not-reviewed'|'needs-change'|'reviewed';note:string};
export type FigureReport = {schemaVersion:1;generatedAt:string;source:{label:string;inputSha256:string;
 profileId:'matplotlib-text-svg-v1';elementCount:number};preview:Capability;measurement:MeasurementReport;
 thresholds:Thresholds;findings:Finding[];manualReview:ManualReview;
 colorModel:{id:string;version:string;severity:100;sourceUrl:string}};
export type PreviewMode = 'original'|'grayscale'|'protanopia-simulation'|'deuteranopia-simulation';
export type PreviewHandle = {status:'enabled';root:SVGSVGElement;dispose:()=>void}|
 {status:'disabled';root:null;reasonCodes:string[];dispose:()=>void};
export type SelectionEvent = {objectId:string|null;mode:PreviewMode;origin:'pointer'|'keyboard'};
export type PreviewOptions = {onSelect:(event:SelectionEvent)=>void;finalSize?:FinalSize|null;objects?:readonly ObjectMeasurement[];font?:TrustedFontAssets;revision?:number};

export type LengthOutcome={kind:'valid';cssPx:number;sourceUnit:string}|{kind:'unassessed';code:string};
export type SimilarityOutcome={kind:'similarity';scale:number}|{kind:'unassessed';reason:'nonuniform'|'singular'|'nonfinite'};
export type ServerHandle={url:string;close:()=>Promise<void>};
export type Limits={maxInputBytes:number;maxElements:number;maxDepth:number;maxAttributeBytes:number;maxPathBytes:number;maxPathCommands:number;maxPathCommandsPerPath:number;maxExpandedVectorCommands:number;maxRasterWorkPixels:number;maxTextChars:number;maxUseInstances:number;maxPreviewSidePx:number;maxPreviewAreaPx:number;minFinalMm:number;maxFinalMm:number;batchSize:number;measureBudgetMs:number};
export const DEFAULT_LIMITS:Readonly<Limits>=Object.freeze({maxInputBytes:2097152,maxElements:4096,maxDepth:64,maxAttributeBytes:65536,maxPathBytes:524288,maxPathCommands:4096,maxPathCommandsPerPath:1024,maxExpandedVectorCommands:2048,maxRasterWorkPixels:128000000,maxTextChars:131072,maxUseInstances:2000,maxPreviewSidePx:2048,maxPreviewAreaPx:4000000,minFinalMm:1,maxFinalMm:500,batchSize:128,measureBudgetMs:15000});

/** Relational checks supplement JSON Schema; callers validate shape first. */
export function validateReportInvariants(report:FigureReport):string[]{
 const errors:string[]=[],m=report.measurement,keys=new Set<string>();
 for(const kind of ['text','stroke'] as const){
  const c=m.coverage[kind];
  if(c.discovered!==c.measured+c.unassessed+c.excluded+c.pending)errors.push('COUNT_SUM');
  for(const status of ['measured','unassessed','excluded'] as const)if(m.objects.filter(o=>o.kind===kind&&o.status===status).length!==c[status])errors.push('COUNT_RECORDS');
 }
 if(m.run.status==='complete'&&(!m.coverage.enumerationComplete||m.coverage.text.pending||m.coverage.stroke.pending))errors.push('FALSE_COMPLETE');
 if(m.run.status==='partial'&&!m.objects.length)errors.push('FALSE_PARTIAL');
 if(['cancelled','timeout','engine-error'].includes(m.run.status)&&m.objects.length)errors.push('REQUIRES_PARTIAL');
 for(const o of m.objects){
  const key=o.objectId+':'+o.kind;if(keys.has(key))errors.push('DUPLICATE_CANDIDATE');keys.add(key);
  if(report.preview.status==='disabled'&&o.status==='measured')errors.push('DISABLED_MEASURED');
 }
 for(const f of report.findings){const kind=f.ruleId==='SMALL_TEXT'?'text':'stroke';const o=m.objects.find(o=>o.objectId===f.objectId&&o.kind===kind);if(!o||o.status!=='measured'||o.finalPt!==f.actualPt)errors.push('INVALID_FINDING');}
 return errors;
}
