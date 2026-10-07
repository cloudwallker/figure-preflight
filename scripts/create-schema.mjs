import {mkdirSync,writeFileSync} from 'node:fs';
const num={type:'number'},str={type:'string'},bool={type:'boolean'},nil={type:'null'},uint={type:'integer',minimum:0};
const en=(...values)=>({enum:values}),ref=n=>({$ref:'#/definitions/'+n}),array=items=>({type:'array',items}),nullable=x=>({anyOf:[x,nil]}),obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const reasons=array(str),profile={const:'matplotlib-text-svg-v1'},hash={type:'string',pattern:'^[a-f0-9]{64}$'},oid={type:'string',pattern:'^o[0-9]+$'},path={type:'string',pattern:'^/0(?:/[0-9]+)*$'};
const d={};
d.Matrix6=obj(Object.fromEntries('abcdef'.split('').map(k=>[k,num])));
d.ViewBox=obj({x:num,y:num,width:{type:'number',exclusiveMinimum:0},height:{type:'number',exclusiveMinimum:0}});
d.Bounds=obj({x:num,y:num,width:{type:'number',minimum:0},height:{type:'number',minimum:0}});
d.Diagnostic=obj({code:str,level:en('error','unassessed','info'),sourcePath:nullable(path),message:str});
d.RootGeometry=obj({viewBox:ref('ViewBox'),originalWidthPx:nullable({type:'number',exclusiveMinimum:0}),originalHeightPx:nullable({type:'number',exclusiveMinimum:0}),preserveAspectRatio:str,aspectBasis:en('root-dimensions','viewBox')});
d.Capability={oneOf:[obj({status:{const:'enabled'},reasonCodes:{...reasons,maxItems:0}}),obj({status:{const:'disabled'},reasonCodes:{...reasons,minItems:1}})]};
d.SourceNode=obj({objectId:oid,ordinal:uint,sourcePath:path,sourceId:nullable(str),tag:str,sanitizedId:nullable(str),retained:bool});
d.ResourceCost=obj({expandedVectorCommands:uint,drawWeight:uint});
d.PreparedSvg=obj({resourceCost:ref('ResourceCost'),profileId:profile,sanitizedMarkup:str,rootGeometry:ref('RootGeometry'),nodes:array(ref('SourceNode')),diagnostics:array(ref('Diagnostic')),inputSha256:hash,label:str,preview:ref('Capability')});
d.ParseOutcome={oneOf:[obj({kind:{const:'accepted'},prepared:ref('PreparedSvg')}),obj({kind:en('invalid','rejected','limited'),diagnostics:array(ref('Diagnostic'))})]};
d.TrustedFontAssets=obj({family:str,version:str,base64:str,sha256:hash,licenseRef:str});
d.TrustedAssets=obj({appJs:str,css:str,font:ref('TrustedFontAssets')});
d.FontStatus=obj({status:en('loaded','unavailable'),family:str,version:str,sha256:hash,licenseRef:str,reasonCodes:reasons});
d.MeasureOptions=obj({widthMm:{type:'number',minimum:1,maximum:500},profileId:profile,revision:uint,fontStatus:ref('FontStatus')});
d.FinalSize=obj({widthMm:{type:'number',minimum:1,maximum:500},heightMm:{type:'number',minimum:1,maximum:500},widthPx:{type:'number',exclusiveMinimum:0,maximum:2048},heightPx:{type:'number',exclusiveMinimum:0,maximum:2048}});
d.Environment=obj({toolVersion:str,browserName:str,browserVersion:str,platform:str,devicePixelRatio:{type:'number',exclusiveMinimum:0},font:ref('FontStatus')});
d.ObjectMeasurement={...obj({objectId:oid,sourcePath:path,sourceId:nullable(str),kind:en('text','stroke'),status:en('measured','unassessed','excluded'),localValue:nullable(num),matrix:nullable(ref('Matrix6')),finalPt:nullable(num),finalMm:nullable(num),bounds:nullable(ref('Bounds')),locationAccuracy:en('exact-environment','approximate','unavailable'),reasonCodes:reasons}),allOf:[
 {if:{properties:{status:{const:'measured'}}},then:{properties:{localValue:num,matrix:ref('Matrix6'),finalPt:num,finalMm:num}},else:{properties:{finalPt:nil,finalMm:nil,reasonCodes:{...reasons,minItems:1}}}},
 {if:{properties:{bounds:nil}},then:{properties:{locationAccuracy:{const:'unavailable'}}},else:{properties:{locationAccuracy:en('exact-environment','approximate')}}}
]};
d.Counts=obj({discovered:uint,measured:uint,unassessed:uint,excluded:uint,pending:uint});
d.Coverage=obj({enumerationComplete:bool,text:ref('Counts'),stroke:ref('Counts'),textCompleteness:{const:'retained-text-only'},possibleOutline:bool,reasonCodes:reasons});
d.RunState={oneOf:[obj({status:{const:'complete'},stopReason:nil}),obj({status:{const:'partial'},stopReason:en('cancelled','timeout','engine-error')}),obj({status:en('cancelled','timeout','engine-error','limited'),stopReason:{type:'string',minLength:1}})]};
d.MeasurementReport=obj({revision:uint,profileId:profile,run:ref('RunState'),finalSize:nullable(ref('FinalSize')),environment:ref('Environment'),objects:array(ref('ObjectMeasurement')),coverage:ref('Coverage'),diagnostics:array(ref('Diagnostic')),elapsedMs:{type:'number',minimum:0}});
d.MeasurementReport.allOf=[{
 if:{properties:{run:{properties:{status:{const:'complete'}}}}},
 then:{properties:{finalSize:ref('FinalSize'),coverage:{properties:{
  enumerationComplete:{const:true},text:{properties:{pending:{const:0}}},stroke:{properties:{pending:{const:0}}}
 }}}}
}];
d.Thresholds=obj({minFontPt:{type:'number',minimum:1,maximum:72},minStrokePt:{type:'number',minimum:.01,maximum:10}});
d.Finding=obj({id:str,objectId:oid,ruleId:en('SMALL_TEXT','THIN_STROKE'),actualPt:num,thresholdPt:num,bounds:nullable(ref('Bounds')),reason:str});
d.ManualReview=obj({status:en('not-reviewed','needs-change','reviewed'),note:str});
d.FigureReport=obj({schemaVersion:{const:1},generatedAt:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$'},source:obj({label:str,inputSha256:hash,profileId:profile,elementCount:uint}),preview:ref('Capability'),measurement:ref('MeasurementReport'),thresholds:ref('Thresholds'),findings:array(ref('Finding')),manualReview:ref('ManualReview'),colorModel:obj({id:str,version:str,severity:{const:100},sourceUrl:str})});
d.LengthOutcome={oneOf:[obj({kind:{const:'valid'},cssPx:num,sourceUnit:str}),obj({kind:{const:'unassessed'},code:str})]};
d.SimilarityOutcome={oneOf:[obj({kind:{const:'similarity'},scale:{type:'number',exclusiveMinimum:0}}),obj({kind:{const:'unassessed'},reason:en('nonuniform','singular','nonfinite')})]};
d.Limits=obj(Object.fromEntries(['maxInputBytes','maxElements','maxDepth','maxAttributeBytes','maxPathBytes','maxPathCommands','maxPathCommandsPerPath','maxExpandedVectorCommands','maxRasterWorkPixels','maxTextChars','maxUseInstances','maxPreviewSidePx','maxPreviewAreaPx','minFinalMm','maxFinalMm','batchSize','measureBudgetMs'].map(k=>[k,{type:'number',exclusiveMinimum:0}])));
d.Limits.description='Production bounds: input 2097152 bytes; 4096 elements; depth 64; attribute 65536 bytes; path 524288 bytes and 4096 commands; 1024 commands per geometry sequence; 2048 expanded vector commands; 128000000 ceil-viewport pixels times conservative draw weight; text 131072 characters; use 2000. parseSvg only permits overrides that tighten these bounds.';
d.PreviewMode=en('original','grayscale','protanopia-simulation','deuteranopia-simulation');
d.SelectionEvent=obj({objectId:nullable(oid),mode:ref('PreviewMode'),origin:en('pointer','keyboard')});
mkdirSync('schemas',{recursive:true});writeFileSync('schemas/figure-report-v1.schema.json',JSON.stringify({$schema:'http://json-schema.org/draft-07/schema#',title:'Figure report v1',...ref('FigureReport'),definitions:d},null,2)+'\n');
