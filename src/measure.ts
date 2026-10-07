import {preparedBudget,previewBudgetReason} from './input.ts';
import {type PreparedSvg,type MeasureOptions,type MeasurementReport,type ObjectMeasurement,type SourceNode,type Matrix6} from './model.ts';
import {viewportTransform,classifySimilarity,parseAbsoluteLength} from './units.ts';
import {textFontReasons} from './font.ts';
const geometry=new Set(['path','line','polyline','polygon','rect','circle','ellipse','use']);
const transparent=(paint:string)=>paint==='none'||paint==='transparent'||/^rgba\([^)]*,\s*0(?:\.0*)?\s*\)$/.test(paint);
const revisions=new WeakMap<HTMLElement,object>();
class Stop extends Error{constructor(readonly reason:'cancelled'|'timeout'){super(reason);}}
const taskYield=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
/** Only consume a successful parseSvg outcome. Each invocation owns an isolated host and uses stage as its logical owner. */
export async function measureSvg(prepared:PreparedSvg,options:MeasureOptions,stage:HTMLElement,signal?:AbortSignal):Promise<MeasurementReport>{
 const started=performance.now();
 const token={};revisions.set(stage,token);
 const zero=()=>({discovered:0,measured:0,unassessed:0,excluded:0,pending:0});
 const r:MeasurementReport={revision:options.revision,profileId:prepared.profileId,run:{status:'complete',stopReason:null},finalSize:null,
 environment:{toolVersion:'0.1.0',browserName:navigator.userAgent.includes('Firefox/')?'Firefox':'Chromium',browserVersion:(navigator.userAgent.match(/(?:Firefox|Chrome)\/([\d.]+)/)?.[1]??'unknown'),platform:navigator.platform,devicePixelRatio:devicePixelRatio,font:{...options.fontStatus,reasonCodes:[...options.fontStatus.reasonCodes]}},objects:[],
 coverage:{enumerationComplete:false,text:zero(),stroke:zero(),textCompleteness:'retained-text-only',possibleOutline:true,reasonCodes:['OUTLINED_TEXT_UNKNOWN']},diagnostics:[...prepared.diagnostics],elapsedMs:0};
 const budget=preparedBudget(prepared);if(!budget){r.run={status:'limited',stopReason:'UNQUALIFIED_SOURCE'};return r;}const limits=budget.limits;
 let host:HTMLDivElement|null=null,batchStarted=started,batchCount=0;
 const check=()=>{if(signal?.aborted||revisions.get(stage)!==token)throw new Stop('cancelled');if(performance.now()-started>=limits.measureBudgetMs)throw new Stop('timeout');};
 const sync=<T>(fn:()=>T):T=>{check();const value=fn();check();return value;};
 const batch=async()=>{check();if(++batchCount>=limits.batchSize||performance.now()-batchStarted>=8){await taskYield();check();batchCount=0;batchStarted=performance.now();}};
 try{
 check();
 if(stage.ownerDocument!==document||!stage.ownerDocument.body)throw Error('Measurement requires this document and its body');
 const g=prepared.rootGeometry,widthMm=options.widthMm,heightMm=widthMm*(g.originalWidthPx&&g.originalHeightPx?g.originalHeightPx/g.originalWidthPx:g.viewBox.height/g.viewBox.width),widthPx=widthMm*96/25.4,heightPx=heightMm*96/25.4;
 if(![widthMm,heightMm,widthPx,heightPx].every(Number.isFinite)||Math.min(widthMm,heightMm)<limits.minFinalMm||Math.max(widthMm,heightMm)>limits.maxFinalMm||Math.max(widthPx,heightPx)>limits.maxPreviewSidePx||widthPx*heightPx>limits.maxPreviewAreaPx){r.run={status:'limited',stopReason:'FINAL_SIZE_LIMIT'};return r;}
 r.finalSize={widthMm,heightMm,widthPx,heightPx};
 const budgetReason=previewBudgetReason(prepared,widthPx,heightPx);if(budgetReason){r.run={status:'limited',stopReason:budgetReason};r.coverage.reasonCodes.push(budgetReason);r.diagnostics.push({code:budgetReason,level:'error',sourcePath:null,message:budgetReason});return r;}
 const v=viewportTransform(g.viewBox,widthPx,heightPx,g.preserveAspectRatio);
 const root=sync(()=>new DOMParser().parseFromString(prepared.sanitizedMarkup,'image/svg+xml').documentElement) as unknown as SVGSVGElement;
 const mapped=new Map(prepared.nodes.filter(n=>n.retained).map(n=>[n.sanitizedId,n]));
 const walk=sync(()=>document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT));
 let entry:Node|null=root;
 const candidates:Array<{n:SourceNode;e:SVGGraphicsElement;kind:'text'|'stroke'}>=[];
 while(entry){check();const e=entry as SVGGraphicsElement,n=mapped.get(e.id);if(n){
 const kinds:Array<'text'|'stroke'>=[];
 // Both roles belong to direct characters, never to a container's descendant tspan.
 if(['text','tspan'].includes(n.tag)&&sync(()=>[...e.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&!!c.textContent?.trim())))kinds.push('text','stroke');
 if(geometry.has(n.tag))kinds.push('stroke');
 for(const kind of kinds){candidates.push({n,e,kind});r.coverage[kind].discovered++;r.coverage[kind].pending++;}
 }entry=sync(()=>walk.nextNode());await batch();}
 r.coverage.enumerationComplete=true;
 let inverse:DOMMatrix|null=null,rootTransform=new DOMMatrix(),rootMappingReason:string|null=null;
 if(prepared.preview.status==='enabled'){
 const list=sync(()=>root.transform.baseVal);
 for(let i=0;i<list.numberOfItems;i++){const t=sync(()=>list.getItem(i).matrix);rootTransform=rootTransform.multiply(new DOMMatrix([t.a,t.b,t.c,t.d,t.e,t.f]));await batch();}
 sync(()=>{root.setAttribute('width',String(widthPx));root.setAttribute('height',String(heightPx));});
 host=sync(()=>document.createElement('div'));sync(()=>{host!.style.cssText='all:initial;position:absolute;left:0;top:0;opacity:0;pointer-events:none;';host!.setAttribute('aria-hidden','true');});
 // stage owns this run logically. First layout occurs outside caller fit transforms,
 // in the same document/font set; only this invisible owned host is mounted/removed.
 const shadow=sync(()=>host!.attachShadow({mode:'closed'}));sync(()=>shadow.appendChild(root));sync(()=>stage.ownerDocument.body.appendChild(host!));await batch();
 const screen=sync(()=>root.getScreenCTM());if(!screen)throw Error('Missing root matrix');
 try{inverse=screen.inverse();}catch{rootMappingReason='ROOT_MAPPING_UNAVAILABLE';}
 if(!inverse||![inverse.a,inverse.b,inverse.c,inverse.d,inverse.e,inverse.f,rootTransform.a,rootTransform.b,rootTransform.c,rootTransform.d,rootTransform.e,rootTransform.f].every(Number.isFinite)){inverse=null;rootMappingReason='ROOT_MAPPING_UNAVAILABLE';}
 }
 const styleCache=new Map<Element,CSSStyleDeclaration>();
 const style=(e:Element)=>{let s=styleCache.get(e);if(!s){s=sync(()=>getComputedStyle(e));styleCache.set(e,s);}return s;};
 for(const {n,e,kind} of candidates){check();const c=r.coverage[kind];
 const o:ObjectMeasurement={objectId:n.objectId,sourceId:n.sourceId,sourcePath:n.sourcePath,kind,status:'unassessed',localValue:null,matrix:null,finalPt:null,finalMm:null,bounds:null,locationAccuracy:'unavailable',reasonCodes:[]};
 if(prepared.preview.status==='disabled')o.reasonCodes=['UNSUPPORTED_VISUAL_FEATURE'];
 else try{
 const css=style(e);let hidden=css.visibility!=='visible',definition=false;
 for(let ancestor:Element|null=e;ancestor;ancestor=ancestor===root?null:ancestor.parentElement){const s=style(ancestor);if(s.display==='none'||Number(s.opacity)===0)hidden=true;if(['defs','clipPath'].includes(ancestor.localName))definition=true;}
 const strokeWidth=parseAbsoluteLength(css.strokeWidth,'presentation');
 const noStroke=transparent(css.stroke)||Number(css.strokeOpacity)===0||(strokeWidth.kind==='valid'&&strokeWidth.cssPx===0);
 const noFill=transparent(css.fill)||Number(css.fillOpacity)===0;
 const zeroFont=['text','tspan'].includes(n.tag)&&parseAbsoluteLength(css.fontSize,'presentation').kind==='valid'&&Number.parseFloat(css.fontSize)===0;
 if(definition||hidden||zeroFont||(kind==='stroke'&&n.tag!=='use'&&noStroke)||(kind==='text'&&noFill&&noStroke)){o.status='excluded';o.reasonCodes=[definition?'DEFINITION_ONLY':'NOT_RENDERED'];}
 else if(n.tag==='use')o.reasonCodes=['USE_INSTANCE_STROKE'];
 else if(kind==='stroke'&&css.getPropertyValue('vector-effect')!=='none')o.reasonCodes=['VECTOR_EFFECT'];
 else if(['text','tspan'].includes(n.tag)&&sync(()=>e.hasAttribute('rotate')||!!e.parentElement?.closest('[rotate]')))o.reasonCodes=['TEXT_ROTATE_UNSUPPORTED'];
 else if(rootMappingReason)o.reasonCodes=[rootMappingReason];
 else{
 const screen=sync(()=>e.getScreenCTM());if(!screen)throw Error('Missing object matrix');
 // Root SVG transform is outside the viewport mapping: R * V * root^-1 * node.
 const m=rootTransform.multiply(new DOMMatrix([v.a,v.b,v.c,v.d,v.e,v.f])).multiply(inverse!).multiply(screen);const matrix:Matrix6={a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f};
 if(Object.values(matrix).every(Number.isFinite))o.matrix=matrix;
 const q=parseAbsoluteLength(kind==='text'?css.fontSize:css.strokeWidth,'presentation'),s=classifySimilarity(matrix);
 if(q.kind==='valid')o.localValue=q.cssPx;
 if(q.kind!=='valid'||s.kind!=='similarity')o.reasonCodes=[q.kind!=='valid'?'UNSUPPORTED_LENGTH':'TRANSFORM_'+(s.kind==='unassessed'?s.reason.toUpperCase():'UNKNOWN')];
 else{
 let b=sync(()=>e.getBBox());
 if(['text','tspan'].includes(n.tag)&&e.children.length){
  const text=e as SVGTextContentElement;
  if(sync(()=>text.getNumberOfChars())!==(e.textContent??'').length)throw Error('Ambiguous direct-text character mapping');
  let offset=0,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const child of e.childNodes){const length=(child.textContent??'').length;
   if(child.nodeType===Node.TEXT_NODE)for(let i=0;i<length;i++){
    const box=sync(()=>text.getExtentOfChar(offset+i));left=Math.min(left,box.x);top=Math.min(top,box.y);right=Math.max(right,box.x+box.width);bottom=Math.max(bottom,box.y+box.height);await batch();
   }offset+=length;
  }b={x:left,y:top,width:right-left,height:bottom-top} as DOMRect;
 }
 if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<0||b.height<0)throw Error('Invalid geometry');
 const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
 const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);const bounds={x:Math.min(...xs)/widthPx,y:Math.min(...ys)/heightPx,width:(Math.max(...xs)-Math.min(...xs))/widthPx,height:(Math.max(...ys)-Math.min(...ys))/heightPx};
 const finalPt=q.cssPx*s.scale*72/96,finalMm=q.cssPx*s.scale*25.4/96;
 if(![...Object.values(bounds),finalPt,finalMm].every(Number.isFinite))throw Error('Invalid final geometry');
 o.bounds=bounds;o.finalPt=finalPt;o.finalMm=finalMm;o.status='measured';o.reasonCodes=['text','tspan'].includes(n.tag)?textFontReasons(options.fontStatus,css,[...e.childNodes].filter(c=>c.nodeType===Node.TEXT_NODE).map(c=>c.textContent??'').join('')):[];o.locationAccuracy=o.reasonCodes.length?'approximate':'exact-environment';
 }
 }
 }catch(error){if(error instanceof Stop)throw error;o.status='unassessed';o.finalPt=null;o.finalMm=null;o.bounds=null;o.locationAccuracy='unavailable';o.reasonCodes=['ENGINE_GEOMETRY_ERROR'];}
 check();r.objects.push(o);c[o.status]++;c.pending--;await batch();
 }
 check();
 }catch(error){const reason=error instanceof Stop?error.reason:'engine-error';r.run=r.objects.length?{status:'partial',stopReason:reason}:{status:reason,stopReason:reason};}
 finally{
 // Cleanup must run even when the checkpoint has already stopped this revision.
 try{host?.remove();}catch{
  try{if(host?.parentNode)host.parentNode.removeChild(host);}catch{r.diagnostics.push({code:'STAGE_CLEANUP_FAILED',level:'error',sourcePath:null,message:'The owned measurement stage could not be removed.'});}
  r.run=r.objects.length?{status:'partial',stopReason:'engine-error'}:{status:'engine-error',stopReason:'engine-error'};
 }
 if(r.run.status==='complete')try{check();}catch(error){const reason=error instanceof Stop?error.reason:'engine-error';r.run=r.objects.length?{status:'partial',stopReason:reason}:{status:reason,stopReason:reason};}
 if(revisions.get(stage)===token)revisions.delete(stage);r.elapsedMs=performance.now()-started;
 if(r.run.status==='complete'&&r.elapsedMs>=limits.measureBudgetMs)r.run=r.objects.length?{status:'partial',stopReason:'timeout'}:{status:'timeout',stopReason:'timeout'};
 }
 return r;
}
