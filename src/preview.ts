import {preparedBudget,previewBudgetReason} from './input.ts';
import type {PreparedSvg,PreviewMode,PreviewOptions,PreviewHandle,ObjectMeasurement,TrustedFontAssets,MeasurementReport} from './model.ts';
import {loadTrustedFont} from './font.ts';
import {sha256} from './sha256.ts';
const NS='http://www.w3.org/2000/svg';
const matrices={grayscale:[.2126,.7152,.0722,.2126,.7152,.0722,.2126,.7152,.0722],'protanopia-simulation':[.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],'deuteranopia-simulation':[.367322,.860646,-.227968,.280085,.672501,.047413,-.011820,.042940,.968881]};
export const PREVIEW_MODES:readonly PreviewMode[]=['original','grayscale','protanopia-simulation','deuteranopia-simulation'];
export const MODE_LABELS:Record<PreviewMode,string>={original:'原色',grayscale:'灰度','protanopia-simulation':'红色觉模拟 · 100%','deuteranopia-simulation':'绿色觉模拟 · 100%'};
let nextPrefix=0;
type State={annotation:SVGGElement;objects:readonly ObjectMeasurement[];elements:Map<string,Element>;width:number;height:number;disposed:boolean;selectedId:string|null;scene?:Scene};
const states=new WeakMap<PreviewHandle,State>();
const readies=new WeakMap<PreviewHandle,Promise<void>>();
const MODEL='machado-2009-2010-linear-whole-image-v1';
type Snapshot={mode:PreviewMode;png:string;sha256:string;pixelWidth:number;pixelHeight:number};
type Scene={prepared:PreparedSvg;key:string;font:TrustedFontAssets;width:number;height:number;pixelWidth:number;pixelHeight:number;refs:Set<State>;decoded:Set<PreviewMode>;snapshots:Map<PreviewMode,Snapshot>;jobs:Map<PreviewMode,Promise<Snapshot>>;source?:Promise<Uint8ClampedArray>;serial:Promise<void>;disposed:boolean;restored:boolean};
let scene:Scene|null=null;
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const fingerprints=new WeakMap<PreparedSvg,string>();
function markupHash(p:PreparedSvg){let hash=fingerprints.get(p);if(!hash){hash=sha256(new TextEncoder().encode(p.sanitizedMarkup));fingerprints.set(p,hash);}return hash;}
function sceneKey(p:PreparedSvg,m:{revision:number;finalSize:MeasurementReport['finalSize']},font:TrustedFontAssets){return JSON.stringify([p.inputSha256,markupHash(p),m.revision,m.finalSize,font.sha256,MODEL]);}
function checkScene(s:Scene){if(s.disposed||scene!==s)throw Error('PREVIEW_CANCELLED');}
function releaseScene(s:Scene){s.disposed=true;s.source=undefined;s.snapshots.clear();s.jobs.clear();s.decoded.clear();}
function acquireScene(prepared:PreparedSvg,options:PreviewOptions,width:number,height:number):Scene{
 const font=options.font!;const key=sceneKey(prepared,{revision:options.revision??0,finalSize:options.finalSize??null},font);
 if(scene?.key===key&&scene.prepared===prepared&&!scene.disposed)return scene;
 if(scene)releaseScene(scene);
 const pixelWidth=Math.ceil(width),pixelHeight=Math.ceil(height);
 const reason=previewBudgetReason(prepared,width,height);if(reason)throw Error(reason);
 return scene={prepared,key,font,width,height,pixelWidth,pixelHeight,refs:new Set(),decoded:new Set(),snapshots:new Map(),jobs:new Map(),serial:Promise.resolve(),disposed:false,restored:false};
}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('');}
// Encode straight RGBA directly: Canvas putImageData/toBlob would premultiply and
// unpremultiply again, accumulating visible rounding errors at partial alpha.
async function encodePng(pixels:Uint8ClampedArray,width:number,height:number,s:Scene):Promise<Uint8Array>{
 const stride=width*4,raw=new Uint8Array((stride+1)*height);for(let y=0;y<height;y++){raw.set(pixels.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);if(y%128===0){await yieldTask();checkScene(s);}}
 const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());checkScene(s);
 const chunk=async(type:string,data:Uint8Array)=>{const output=new Uint8Array(data.length+12),view=new DataView(output.buffer);view.setUint32(0,data.length);for(let i=0;i<4;i++)output[4+i]=type.charCodeAt(i);output.set(data,8);let crc=0xffffffff,batch=performance.now();for(let i=4;i<data.length+8;i++){crc^=output[i];for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);if(i%16384===0&&performance.now()-batch>=8){await yieldTask();checkScene(s);batch=performance.now();}}view.setUint32(data.length+8,(crc^0xffffffff)>>>0);return output;};
 const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),await chunk('IHDR',header),await chunk('IDAT',compressed),await chunk('IEND',new Uint8Array())];const png=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){png.set(c,offset);offset+=c.length;}return png;
}
async function rasterSource(s:Scene,source:SVGSVGElement):Promise<Uint8ClampedArray>{
 checkScene(s);const font=await loadTrustedFont(s.font);if(font.status!=='loaded')throw Error('FONT_ASSET_MISMATCH');checkScene(s);
 const doc=source.ownerDocument,outer=svg(doc,'svg',{xmlns:NS,width:String(s.pixelWidth),height:String(s.pixelHeight),viewBox:`0 0 ${s.width} ${s.height}`});outer.setAttribute('overflow','hidden');
 const style=svg(doc,'style');style.textContent=`@font-face{font-family:'DejaVu Sans';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${s.font.base64})}`;outer.append(style,source.cloneNode(true));
 const blob=new Blob([new XMLSerializer().serializeToString(outer)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image(),canvas=doc.createElement('canvas');canvas.width=s.pixelWidth;canvas.height=s.pixelHeight;
 try{image.src=url;await image.decode();checkScene(s);await yieldTask();checkScene(s);const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('PREVIEW_CANVAS_UNAVAILABLE');context.drawImage(image,0,0);return context.getImageData(0,0,s.pixelWidth,s.pixelHeight).data;}
 finally{image.src='';URL.revokeObjectURL(url);canvas.width=canvas.height=0;outer.replaceChildren();}
}
async function convert(s:Scene,mode:Exclude<PreviewMode,'original'>,source:SVGSVGElement):Promise<Snapshot>{
 checkScene(s);if(!s.source)s.source=rasterSource(s,source);const pixels=new Uint8ClampedArray(await s.source);checkScene(s);const linear=Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}),matrix=matrices[mode];
 const encode=(v:number)=>{v=Math.max(0,Math.min(1,v));return Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));};
 let batch=performance.now();for(let i=0;i<pixels.length;i+=4){const r=linear[pixels[i]],g=linear[pixels[i+1]],b=linear[pixels[i+2]];pixels[i]=encode(matrix[0]*r+matrix[1]*g+matrix[2]*b);pixels[i+1]=encode(matrix[3]*r+matrix[4]*g+matrix[5]*b);pixels[i+2]=encode(matrix[6]*r+matrix[7]*g+matrix[8]*b);if(i%16384===0&&performance.now()-batch>=8){await yieldTask();checkScene(s);batch=performance.now();}}
 const bytes=await encodePng(pixels,s.pixelWidth,s.pixelHeight,s),blob=new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/png'});checkScene(s);if(blob.size>s.pixelWidth*s.pixelHeight*5+65536)throw Error('PREVIEW_PNG_LIMIT');const sha256=await digest(bytes);checkScene(s);const png=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('PREVIEW_ENCODING_FAILED'));reader.readAsDataURL(blob);});checkScene(s);return {mode,png,sha256,pixelWidth:s.pixelWidth,pixelHeight:s.pixelHeight};
}
function snapshotFor(s:Scene,mode:Exclude<PreviewMode,'original'>,source:SVGSVGElement):Promise<Snapshot>{
 const existing=s.snapshots.get(mode);if(existing)return Promise.resolve(existing);const job=s.jobs.get(mode);if(job)return job;if(s.restored)return Promise.reject(Error('SAVED_PREVIEW_MISSING'));
 const next=s.serial.then(()=>convert(s,mode,source)).then(snapshot=>{checkScene(s);s.snapshots.set(mode,snapshot);if(s.snapshots.size===3)s.source=undefined;return snapshot;});s.jobs.set(mode,next);s.serial=next.then(()=>{},()=>{});return next;
}

/** Internal app/report bridge. Every promise belongs to an actual handle. */
export function whenPreviewReady(handle:PreviewHandle):Promise<void>{return readies.get(handle)??Promise.reject(Error('UNKNOWN_PREVIEW_HANDLE'));}
/** Only the current, completed, renderer-owned scene can authorize an HTML snapshot. */
export function savedPreviewState(prepared:PreparedSvg,measured:MeasurementReport,font:TrustedFontAssets):unknown{
 if(prepared.preview.status==='disabled'||measured.run.status==='limited'||!measured.finalSize)return {key:sceneKey(prepared,measured,font),snapshots:[]};
 if(!scene||scene.disposed||scene.prepared!==prepared||scene.key!==sceneKey(prepared,measured,font)||(scene.snapshots.size!==3||scene.decoded.size!==3))throw Error('PREVIEW_NOT_READY');return {key:scene.key,snapshots:PREVIEW_MODES.slice(1).map(mode=>scene!.snapshots.get(mode))};
}
/** Called only by the generated offline document bootstrap, never the File input. */
export async function restoreSavedPreviewState(prepared:PreparedSvg,measured:MeasurementReport,font:TrustedFontAssets,payload:any):Promise<void>{
 if(payload?.key!==sceneKey(prepared,measured,font)||!Array.isArray(payload.snapshots))throw Error('SAVED_PREVIEW_MISMATCH');
 if(prepared.preview.status==='disabled'||measured.run.status==='limited'||!measured.finalSize){if(payload.snapshots.length)throw Error('SAVED_PREVIEW_MISMATCH');return;}
 const s=acquireScene(prepared,{onSelect:()=>{},font,revision:measured.revision,finalSize:measured.finalSize},measured.finalSize.widthPx,measured.finalSize.heightPx);s.restored=true;
 if(payload.snapshots.length!==3)throw Error('SAVED_PREVIEW_MISMATCH');
 for(const snapshot of payload.snapshots){if(!PREVIEW_MODES.slice(1).includes(snapshot.mode)||s.snapshots.has(snapshot.mode)||typeof snapshot.png!=='string'||!snapshot.png.startsWith('data:image/png;base64,')||snapshot.pixelWidth!==s.pixelWidth||snapshot.pixelHeight!==s.pixelHeight)throw Error('SAVED_PREVIEW_MISMATCH');if(snapshot.png.length>22+4*Math.ceil((s.pixelWidth*s.pixelHeight*5+65536)/3))throw Error('SAVED_PREVIEW_LIMIT');const raw=atob(snapshot.png.slice(22));if(raw.length>s.pixelWidth*s.pixelHeight*5+65536)throw Error('SAVED_PREVIEW_LIMIT');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const header=new DataView(bytes.buffer);if(bytes.length<24||[137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b)||header.getUint32(16)!==s.pixelWidth||header.getUint32(20)!==s.pixelHeight||await digest(bytes)!==snapshot.sha256)throw Error('SAVED_PREVIEW_MISMATCH');s.snapshots.set(snapshot.mode,snapshot);}
}
function svg<K extends keyof SVGElementTagNameMap>(document:Document,tag:K,attributes:Record<string,string>={}):SVGElementTagNameMap[K]{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attributes))e.setAttribute(k,v);return e;}

/** Renders the accepted reconstruction; measurement values are supplied by the sole producer. */
export function createPreview(prepared:PreparedSvg,mode:PreviewMode,target:HTMLElement,options:PreviewOptions):PreviewHandle{
 const doc=target.ownerDocument;
 const disabled=(reasonCodes:string[]):PreviewHandle=>{const message=doc.createElement('p');message.className='preview-disabled';message.textContent='预览停用：'+reasonCodes.join('、');target.append(message);const handle:PreviewHandle={status:'disabled',root:null,reasonCodes,dispose:()=>message.remove()};readies.set(handle,Promise.resolve());return handle;};
 if(prepared.preview.status==='disabled')return disabled([...prepared.preview.reasonCodes]);
 if(!PREVIEW_MODES.includes(mode))return disabled(['INVALID_PREVIEW_MODE']);
 if(options.finalSize===null)return disabled(['NO_FINAL_SIZE']);
 const g=prepared.rootGeometry,w=options.finalSize?.widthPx??g.originalWidthPx??g.viewBox.width,h=options.finalSize?.heightPx??g.originalHeightPx??g.viewBox.height;
 const reason=previewBudgetReason(prepared,w,h);if(reason)return disabled([reason]);const limits=preparedBudget(prepared)!.limits;
 if(options.finalSize){const s=options.finalSize;if(![s.widthMm,s.heightMm].every(n=>Number.isFinite(n)&&n>=limits.minFinalMm&&n<=limits.maxFinalMm)||Math.abs(s.widthMm*96/25.4-w)>1e-6||Math.abs(s.heightMm*96/25.4-h)>1e-6)return disabled(['INVALID_FINAL_SIZE']);}
 const validIds=new Set(prepared.nodes.map(n=>n.objectId)),keys=new Set<string>();
 for(const o of options.objects??[]){const key=o.objectId+':'+o.kind;if(!validIds.has(o.objectId)||keys.has(key)||o.bounds&&(!Object.values(o.bounds).every(Number.isFinite)||o.bounds.width<0||o.bounds.height<0))return disabled(['INVALID_PREVIEW_OBJECTS']);keys.add(key);}
 const prefix=`p${++nextPrefix}-${mode}-`,idMap=new Map<string,string>(),sourceIds=new Map(prepared.nodes.filter(n=>n.retained&&n.sanitizedId).map(n=>[n.sanitizedId!,n.objectId]));
 const elements=new Map<string,Element>(),objectIds=new WeakMap<Element,string>();
 const root=svg(doc,'svg',{width:String(w),height:String(h),viewBox:`0 0 ${w} ${h}`,'aria-label':MODE_LABELS[mode],role:'group'});root.style.cssText='display:block;overflow:hidden;max-width:100%;height:auto';
 const defs=svg(doc,'defs'),figure=svg(doc,'g',{'data-layer':'figure'}),annotation=svg(doc,'g',{'data-layer':'annotation','pointer-events':'none'});
 if(mode!=='original')figure.setAttribute('opacity','0');
 const pending=svg(doc,'text',{x:'8',y:'20',fill:'#526176','font-size':'12'});pending.textContent='预览准备中…';root.append(defs,figure,annotation,pending);target.append(root);
 const state:State={annotation,objects:options.objects??[],elements,width:w,height:h,disposed:false,selectedId:null};
 const click=(event:Event)=>{if(state.disposed)return;let node=event.target as Element|null;while(node&&node!==root){const objectId=objectIds.get(node);if(objectId&&node.hasAttribute('tabindex')){options.onSelect({objectId,mode,origin:event.type==='keydown'?'keyboard':'pointer'});return;}node=node.parentElement;}};
 const key=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();click(event);}};
 root.addEventListener('click',click);root.addEventListener('keydown',key);
 const handle:PreviewHandle={status:'enabled',root,dispose:()=>{if(state.disposed)return;state.disposed=true;root.removeEventListener('click',click);root.removeEventListener('keydown',key);root.remove();root.replaceChildren();state.annotation.replaceChildren();elements.clear();states.delete(handle);const owned=state.scene;state.scene=undefined;owned?.refs.delete(state);if(owned&&!owned.refs.size){releaseScene(owned);if(scene===owned)scene=null;}}};states.set(handle,state);
 const check=()=>{if(state.disposed)throw Error('PREVIEW_CANCELLED');};
 const ready=(async()=>{try{
  // Keep the scene's existing references alive before an older report disposes.
  let sceneForMode:Scene|undefined;if(mode!=='original'){if(!options.font)throw Error('TRUSTED_FONT_REQUIRED');sceneForMode=acquireScene(prepared,options,w,h);state.scene=sceneForMode;sceneForMode.refs.add(state);}
  await yieldTask();check();
  const parsed=new DOMParser().parseFromString(prepared.sanitizedMarkup,'image/svg+xml');check();
  await yieldTask();check();const source=doc.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;
  const all=[source,...source.querySelectorAll('*')];let batch=performance.now();
  const checkpoint=async()=>{if(performance.now()-batch>=8){await yieldTask();check();batch=performance.now();}};
  for(const e of all){const oid=sourceIds.get(e.id);if(oid){const id=prefix+oid;idMap.set(e.id,id);e.id=id;objectIds.set(e,oid);elements.set(oid,e);}await checkpoint();}
  for(const e of all){for(const attr of Array.from(e.attributes)){let value=attr.value;if(attr.localName==='href'&&value.startsWith('#'))value='#'+idMap.get(value.slice(1));if(attr.localName==='clip-path'||attr.localName==='style')value=value.replace(/url\(#([^)]*)\)/g,(_,id)=>`url(#${idMap.get(id)})`);if(value!==attr.value)e.setAttributeNS(attr.namespaceURI,attr.name,value);}
   if(['text','tspan','path','line','polyline','polygon','rect','circle','ellipse','use'].includes(e.localName)&&!e.closest('defs,clipPath')){e.setAttribute('tabindex','0');e.setAttribute('role','button');e.setAttribute('aria-pressed','false');e.setAttribute('aria-label','选择图中对象 '+objectIds.get(e));}await checkpoint();}
  source.setAttribute('width',String(w));source.setAttribute('height',String(h));source.setAttribute('overflow','visible');
  const showSource=()=>{figure.append(source);selectObject(handle,state.selectedId);};
  await yieldTask();check();
  if(mode==='original'){showSource();pending.remove();root.dataset.previewReady='true';return;}
  const scene=sceneForMode!,snapshot=await snapshotFor(scene,mode,source);check();checkScene(scene);
  const decoded=new Image();try{decoded.src=snapshot.png;await decoded.decode();check();checkScene(scene);}finally{decoded.src='';}
  showSource();
  const visible=svg(doc,'image',{x:'0',y:'0',width:String(w),height:String(h),href:snapshot.png,'pointer-events':'none'});root.insertBefore(visible,figure);pending.remove();root.dataset.previewReady='true';scene.decoded.add(mode);
 }catch{pending.textContent=state.disposed?'':'预览未完成，请重新导入。';root.dataset.previewError='PREVIEW_UNAVAILABLE';throw Error(state.disposed?'PREVIEW_CANCELLED':'PREVIEW_UNAVAILABLE');}})();readies.set(handle,ready);void ready.catch(()=>{});return handle;
}

export function selectObject(handle:PreviewHandle,objectId:string|null):void{
 const state=states.get(handle);if(!state||state.disposed||handle.status==='disabled')return;
 state.annotation.replaceChildren();const previous=state.selectedId?state.elements.get(state.selectedId):undefined,next=objectId?state.elements.get(objectId):undefined;if(previous?.hasAttribute('tabindex'))previous.setAttribute('aria-pressed','false');if(next?.hasAttribute('tabindex'))next.setAttribute('aria-pressed','true');state.selectedId=objectId;
 if(objectId===null)return;
 const bounds=state.objects.filter(o=>o.objectId===objectId&&o.bounds!==null).map(o=>o.bounds!);
 for(const b of bounds){const rect=svg(handle.root.ownerDocument,'rect',{x:String(b.x*state.width),y:String(b.y*state.height),width:String(Math.max(b.width*state.width,.5)),height:String(Math.max(b.height*state.height,.5)),fill:'none',stroke:'#1d4ed8','stroke-width':'1.5','vector-effect':'non-scaling-stroke','data-selection':objectId});state.annotation.append(rect);}
}
