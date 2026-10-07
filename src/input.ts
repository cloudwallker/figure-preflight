import {DEFAULT_LIMITS,type Limits,type ParseOutcome,type SourceNode,type Diagnostic,type PreparedSvg,type ResourceCost} from './model.ts';
import {parseAbsoluteLength,viewportTransform} from './units.ts';
import {sha256} from './sha256.ts';
const SVG='http://www.w3.org/2000/svg',XLINK='http://www.w3.org/1999/xlink',XML='http://www.w3.org/XML/1998/namespace',XMLNS='http://www.w3.org/2000/xmlns/';
const N='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const NUMBER=new RegExp('^'+N+'$');
const GEOMETRY=new Set(['path','line','polyline','polygon','rect','circle','ellipse']);
const ATTRS:Record<string,string[]>={svg:['version','width','height','viewBox','preserveAspectRatio'],g:[],defs:[],path:['d'],line:['x1','x2','y1','y2'],polyline:['points'],polygon:['points'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],text:['x','y','dx','dy','rotate'],tspan:['x','y','dx','dy','rotate'],clipPath:['clipPathUnits'],use:['x','y','href'],style:['type'],title:[],desc:[],metadata:[]};
const FIELDS=new Set('fill fill-opacity fill-rule stroke stroke-opacity stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity clip-path font font-family font-size font-style font-weight font-stretch font-variant text-anchor display visibility vector-effect'.split(' '));
class InputError extends Error {kind:'rejected'|'invalid'|'limited';code:string;constructor(kind:'rejected'|'invalid'|'limited',code:string){super(code);this.kind=kind;this.code=code;}}
const fail=(kind:'rejected'|'invalid'|'limited',code:string):never=>{throw new InputError(kind,code);};
const byteLength=(s:string)=>new TextEncoder().encode(s).length;
const budgets=new WeakMap<PreparedSvg,{readonly limits:Readonly<Limits>;readonly cost:ResourceCost}>();
function freezeTree<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;}
/** Internal consumers accept only immutable output of this parser, not copied DTOs. */
export function preparedBudget(prepared:PreparedSvg){return budgets.get(prepared)??null;}
/** Shared viewport gate; no native layout or raster operation occurs here. */
export function previewBudgetReason(prepared:PreparedSvg,width:number,height:number):string|null{
 const budget=preparedBudget(prepared);if(!budget)return 'UNQUALIFIED_SOURCE';const {limits:l,cost}=budget,w=Math.ceil(width),h=Math.ceil(height),area=w*h;
 if(![width,height,w,h,area].every(Number.isFinite)||Math.min(width,height)<=0||Math.max(w,h)>l.maxPreviewSidePx||area>l.maxPreviewAreaPx)return 'PREVIEW_LIMIT';
 const work=area*cost.drawWeight;if(!Number.isSafeInteger(work)||work>l.maxRasterWorkPixels)return 'RASTER_WORK_LIMIT';return null;
}
/** Private saved-HTML bootstrap only. Reuses parseSvg; saved costs grant no authority. */
export function restorePreparedSvg(saved:PreparedSvg,savedLimits:Limits):PreparedSvg{
 const reject=():never=>{throw Error('SAVED_SOURCE_MISMATCH');};
 if(!saved||saved.profileId!=='matplotlib-text-svg-v1'||typeof saved.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(saved.inputSha256)||typeof saved.label!=='string'||saved.label.length>255||!Array.isArray(saved.nodes)||saved.nodes.length>DEFAULT_LIMITS.maxElements)reject();
 const ids=new Set<string>();let last=-1;
 for(const n of saved.nodes){if(!n||!Number.isSafeInteger(n.ordinal)||n.ordinal<=last||n.ordinal>=DEFAULT_LIMITS.maxElements||n.objectId!=='o'+n.ordinal||n.sanitizedId!=='s-'+n.objectId||!n.retained||ids.has(n.sanitizedId!)||typeof n.tag!=='string'||!(n.tag in ATTRS)||typeof n.sourcePath!=='string'||n.sourcePath.length>1024||!/^\/0(?:\/\d+)*$/.test(n.sourcePath)||(n.sourceId!==null&&(typeof n.sourceId!=='string'||byteLength(n.sourceId)>DEFAULT_LIMITS.maxAttributeBytes)))reject();ids.add(n.sanitizedId!);last=n.ordinal;}
 if(saved.preview?.status==='disabled'){
  if(saved.sanitizedMarkup!==''||!Array.isArray(saved.preview.reasonCodes)||saved.preview.reasonCodes.length>100||saved.preview.reasonCodes.some(c=>typeof c!=='string'||c.length>128))reject();
  // This metadata object intentionally has no WeakMap budget and cannot draw.
  return freezeTree(structuredClone(saved));
 }
 if(saved.preview?.status!=='enabled'||typeof saved.sanitizedMarkup!=='string')reject();
 const parsed=parseSvg(new TextEncoder().encode(saved.sanitizedMarkup),saved.label,savedLimits);
 if(parsed.kind!=='accepted'||parsed.prepared.preview.status!=='enabled')reject();
 const verified=(parsed as Extract<ParseOutcome,{kind:'accepted'}>).prepared,budget=preparedBudget(verified)!;
 if(verified.nodes.length!==saved.nodes.length||JSON.stringify(verified.rootGeometry)!==JSON.stringify(saved.rootGeometry))reject();
 const renamed=new Map<string,string>();
 for(let i=0;i<verified.nodes.length;i++){const actual=verified.nodes[i],original=saved.nodes[i];if(!actual.retained||actual.sourceId!==original.sanitizedId||actual.tag!==original.tag)reject();renamed.set(actual.sanitizedId!,original.sanitizedId!);}
 const doc=new DOMParser().parseFromString(verified.sanitizedMarkup,'image/svg+xml');
 for(const el of [doc.documentElement,...doc.documentElement.getElementsByTagName('*')]){
  const id=renamed.get(el.id);if(!id)reject();el.id=id!;
  if(el.hasAttribute('href')){const target=renamed.get(el.getAttribute('href')!.slice(1));if(!target)reject();el.setAttribute('href','#'+target);}
  if(el.hasAttribute('clip-path')){const old=/^url\(#([^)]*)\)$/.exec(el.getAttribute('clip-path')!)?.[1],target=old?renamed.get(old):null;if(!target)reject();el.setAttribute('clip-path','url(#'+target+')');}
 }
 const markup=new XMLSerializer().serializeToString(doc.documentElement);
 // Only the canonical bytes that were actually revalidated receive authority.
 if(markup!==saved.sanitizedMarkup)reject();
 const result:PreparedSvg=freezeTree({...verified,inputSha256:saved.inputSha256,label:saved.label,sanitizedMarkup:markup,nodes:structuredClone(saved.nodes)});
 budgets.set(result,budget);return result;
}
function numericList(value:string):number[]{
 const s=value.trim();if(!s)return [];
 if(!new RegExp('^'+N+'(?:(?:\\s+|\\s*,\\s*)'+N+')*$').test(s))return fail('invalid','INVALID_NUMBER_LIST');
 const numbers=s.split(/[\s,]+/).map(Number);if(!numbers.every(Number.isFinite))return fail('invalid','NONFINITE_NUMBER');return numbers;
}
/** Decode CSS escapes and comments before checking resource tokens. Malformed streams fail closed. */
function cssTokens(raw:string):string {
 let s='',quote='',depth=0;
 for(let i=0;i<raw.length;i++){
  let c=raw[i];
  if(c==='\\'){
   const m=/^[0-9a-fA-F]{1,6}(?:\s)?/.exec(raw.slice(i+1));
   if(m){const cp=parseInt(m[0].trim(),16);if(!cp||cp>0x10ffff)fail('rejected','CSS_ESCAPE');c=String.fromCodePoint(cp);i+=m[0].length;}
   else {if(i+1>=raw.length||/[\r\n\f]/.test(raw[i+1]))fail('rejected','CSS_ESCAPE');c=raw[++i];}
   s+=c;continue;
  }
  if(!quote&&c==='/'&&raw[i+1]==='*'){const end=raw.indexOf('*/',i+2);if(end<0)fail('rejected','CSS_COMMENT');i=end+1;continue;}
  if(c==='"'||c==="'"){if(!quote)quote=c;else if(quote===c)quote='';}
  if(!quote){if(c==='(')depth++;if(c===')'&&--depth<0)fail('invalid','CSS_SYNTAX');}
  if(c==='\0')fail('rejected','CSS_NULL');s+=c;
 }
 if(quote||depth)fail('invalid','CSS_SYNTAX');
 const compact=s.replace(/\s/g,'').toLowerCase();
 if(/@(?:import|font-face)|expression\(|(?:behavior|-moz-binding)\s*:|(?:javascript|data|blob|file):/.test(compact))fail('rejected','DANGEROUS_CSS');
 for(const m of s.matchAll(/url\s*\(\s*([^)]*)\)/gi)){let target=m[1].trim();if((target[0]==='"'&&target.at(-1)==='"')||(target[0]==="'"&&target.at(-1)==="'"))target=target.slice(1,-1);if(!/^#[^\r\n]+$/.test(target))fail('rejected','EXTERNAL_RESOURCE');}
 return s;
}
function declarations(raw:string):Array<[string,string]>{
 const s=cssTokens(raw),out:Array<[string,string]>=[];let start=0,quote='',depth=0;
 for(let i=0;i<=s.length;i++){
  const c=s[i];if(c==='"'||c==="'"){if(!quote)quote=c;else if(quote===c)quote='';}
  if(!quote){if(c==='(')depth++;if(c===')')depth--;}
  if(i===s.length||(!quote&&!depth&&c===';')){const chunk=s.slice(start,i).trim();start=i+1;if(!chunk)continue;const colon=chunk.indexOf(':');if(colon<1)fail('invalid','CSS_DECLARATION');const key=chunk.slice(0,colon).trim().toLowerCase(),value=chunk.slice(colon+1).trim();if(!/^[-a-z]+$/.test(key)||!value)fail('invalid','CSS_DECLARATION');out.push([key,value]);}
 }
 return out;
}
function pathCommands(d:string):number{
 if(!d.trim())return 0;
 if(/,\s*,|^[\s,]*,|,\s*$|[A-Za-z]\s*,|,\s*[A-DF-Za-df-z]/.test(d))fail('invalid','PATH_SEPARATOR');
 const token=new RegExp('[a-zA-Z]|'+N,'g'),parts=d.match(token)??[];
 if(d.replace(token,'').replace(/[\s,]/g,''))fail('invalid','INVALID_PATH');
 if(!/^[Mm]$/.test(parts[0]??''))fail('invalid','PATH_MOVETO');
 const arity:Record<string,number>={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};let command='',i=0,count=0;
 while(i<parts.length){if(/^[A-Za-z]$/.test(parts[i])){command=parts[i++];if(!(command.toUpperCase() in arity))fail('invalid','PATH_COMMAND');if(command.toUpperCase()==='Z'){count++;command='';continue;}}
  const n=arity[command.toUpperCase()];if(!n||i+n>parts.length)fail('invalid','PATH_PARAMETERS');
  const values=parts.slice(i,i+n);if(values.some(v=>!NUMBER.test(v)||!Number.isFinite(Number(v))))fail('invalid','PATH_PARAMETERS');
  if(command.toUpperCase()==='A'&&(Number(values[0])<0||Number(values[1])<0||!['0','1'].includes(values[3])||!['0','1'].includes(values[4])))fail('invalid','PATH_ARC');
  i+=n;count++;if(command==='M')command='L';if(command==='m')command='l';
 }
 return count;
}
function transform(raw:string):void{
 const re=/([A-Za-z]+)\s*\(([^()]*)\)/g;let last=0,count=0;
 for(const m of raw.matchAll(re)){
  if(raw.slice(last,m.index).trim().replace(/,/g,''))fail('invalid','TRANSFORM_SYNTAX');
  const ns=numericList(m[2]),counts:Record<string,number[]>={matrix:[6],translate:[1,2],scale:[1,2],rotate:[1,3],skewX:[1],skewY:[1]};
  if(!counts[m[1]]?.includes(ns.length))fail('invalid','TRANSFORM_PARAMETERS');last=m.index!+m[0].length;count++;
 }
 if(!count||raw.slice(last).trim())fail('invalid','TRANSFORM_SYNTAX');
}
function stripProlog(raw:string):string{
 let s=raw.replace(/^\uFEFF/,'');
 if(s.startsWith('<?xml')){
  const declaration=/^<\?xml\s+version\s*=\s*(['"])1\.0\1\s+encoding\s*=\s*(['"])utf-8\2(?:\s+standalone\s*=\s*(['"])no\3)?\s*\?>/i.exec(s);
  if(!declaration)fail('rejected','XML_DECLARATION');s=s.slice(declaration![0].length);
 }
 const doctype=/^\s*<!DOCTYPE\s+svg\s+PUBLIC\s+(['"])-\/\/W3C\/\/DTD SVG 1\.1\/\/EN\1\s+(['"])http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd\2\s*>/;
 const d=doctype.exec(s);if(d)s=s.slice(d[0].length);
 const inspected=s.replace(/<!--[\s\S]*?-->/g,'').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'');
 if(/<\?|<!/i.test(inspected))fail('rejected','XML_DECLARATION');
 // Comments are discarded by contract; remove them before the native XML parser
 // allocates comment nodes. Keep CDATA intact, including comment-looking text.
 return s.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g,token=>{
  if(token.startsWith('<![CDATA['))return token;
  if(/--/.test(token.slice(4,-3))||token.slice(4,-3).endsWith('-'))fail('invalid','XML_COMMENT');return '';
 });
}
function lexicalLimits(s:string,l:Limits):void{
 let depth=0,count=0;
 const clean=s.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g,'');
 for(const m of clean.matchAll(/<(?:[^<>"']|"[^"]*"|'[^']*')*>/g)){
  const tag=m[0];if(tag.startsWith('</'))depth--;else{count++;depth++;if(count>l.maxElements||depth>l.maxDepth)fail('limited','XML_LIMIT');if(tag.endsWith('/>'))depth--;}
 }
}
/** The single danger-policy pass covers every source node before rebuilding or
 * structural diagnostics, including metadata and unsupported/removed subtrees. */
function scanDangerousContent(root:Element):void {
 for(const el of [root,...root.getElementsByTagName('*')]){
  if(/^(?:script|foreignobject|image|animate.*|set|discard|iframe|object|embed|link)$/i.test(el.localName))fail('rejected','EXECUTABLE_ELEMENT');
  for(const a of el.attributes){const name=a.localName.toLowerCase();
   if(/^on/.test(name)||(a.namespaceURI===XML&&name==='base'))fail('rejected','EXECUTABLE_ATTRIBUTE');
   if(a.namespaceURI===XMLNS)continue;
   if(['href','src','action','poster'].includes(name)&&!a.value.startsWith('#'))fail('rejected','EXTERNAL_RESOURCE');
   if(name==='style'||/url\s*\(|\\|\/\*/i.test(a.value))cssTokens(a.value);
   if(/^(?:data|blob|file|javascript):/i.test(a.value.trim()))fail('rejected','EXTERNAL_RESOURCE');
  }
  if(el.localName==='style')cssTokens(el.textContent??'');
 }
}
export function parseSvg(bytes:Uint8Array,label:string,limits?:Limits):ParseOutcome {
 const diagnostics:Diagnostic[]=[];let currentPath:string|null=null;
 try{
  const l={...DEFAULT_LIMITS};for(const [key,value] of Object.entries(limits??{})){if(!(key in l)||!Number.isFinite(value)||value<=0)fail('invalid','INVALID_LIMIT');const k=key as keyof Limits;l[k]=k==='minFinalMm'?Math.max(l[k],value):Math.min(l[k],value);}
  if(bytes.byteLength>l.maxInputBytes)fail('limited','INPUT_BYTES');
  let xml:string;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return {kind:'invalid',diagnostics:[{code:'UTF8',level:'error',sourcePath:null,message:'Input must be valid UTF-8.'}]};}
  xml=stripProlog(xml);lexicalLimits(xml,l);
  const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
  if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName==='parsererror')fail('invalid','XML_PARSE');
  const root=doc.documentElement;if(root.localName!=='svg'||root.namespaceURI!==SVG)fail('invalid','SVG_ROOT');
  scanDangerousContent(root);
  const entries:Array<{el:Element;node:SourceNode;removed:boolean;ancestorRemoved:boolean}>=[],ids=new Map<string,Element>(),nodeMap=new Map<Element,SourceNode>();
  let unknown=false,textChars=0,commands=0,uses=0;const geometryCommands=new Map<Element,number>();
  const visit=(el:Element,path:string,depth:number,removed:boolean)=>{
   currentPath=path;const ordinal=entries.length,tag=el.localName,sourceId=el.getAttribute('id');
   if(ordinal>=l.maxElements||depth>l.maxDepth)fail('limited','XML_LIMIT');
   const node:SourceNode={objectId:'o'+ordinal,ordinal,sourcePath:path,sourceId,tag,sanitizedId:null,retained:false};nodeMap.set(el,node);
   const drop=removed||tag==='metadata'||tag==='style'||!(tag in ATTRS)||el.namespaceURI!==SVG;
   entries.push({el,node,removed:drop,ancestorRemoved:removed});
   if(sourceId!==null){if(ids.has(sourceId))fail('invalid','DUPLICATE_ID');ids.set(sourceId,el);}
   for(const a of el.attributes){
    if(byteLength(a.value)>(tag==='path'&&a.localName==='d'?l.maxPathBytes:l.maxAttributeBytes))fail('limited','ATTRIBUTE_BYTES');
   }
   if(GEOMETRY.has(tag)){
    const count=tag==='path'?pathCommands(el.getAttribute('d')??''):tag==='polyline'||tag==='polygon'?numericList(el.getAttribute('points')??'').length/2+(tag==='polygon'?1:0):tag==='line'?2:tag==='rect'?5:6;
    if(count>l.maxPathCommandsPerPath)fail('limited','PATH_SEQUENCE_COMMANDS');geometryCommands.set(el,count);
    if(tag==='path'){commands+=count;if(commands>l.maxPathCommands)fail('limited','PATH_COMMANDS');}
   }
   if(tag==='use'&&++uses>l.maxUseInstances)fail('limited','USE_INSTANCES');
   for(const child of el.childNodes)if(child.nodeType===3||child.nodeType===4)textChars+=(child.nodeValue??'').length;
   if(textChars>l.maxTextChars)fail('limited','TEXT_CHARACTERS');
   let index=0;for(const child of el.children)visit(child,path+'/'+index++,depth+1,drop||tag==='title'||tag==='desc');
  };visit(root,'/0',1,false);
  const vb=numericList(root.getAttribute('viewBox')??'');if(vb.length!==4||vb[2]<=0||vb[3]<=0)fail('invalid','VIEWBOX');
  const viewBox={x:vb[0],y:vb[1],width:vb[2],height:vb[3]},par=root.getAttribute('preserveAspectRatio')??'xMidYMid meet';
  const dimension=(name:string):number|null=>{if(!root.hasAttribute(name))return null;const r=parseAbsoluteLength(root.getAttribute(name)!,'root');if(r.kind==='valid')return r.cssPx;if(/(?:%|em|ex|rem|vw|vh)$/.test(root.getAttribute(name)!)){unknown=true;return null;}return fail('invalid','ROOT_LENGTH');};
  const width=dimension('width'),height=dimension('height');
  currentPath='/0';
  try{
   // A paired root size is the actual source viewport; using only a 1px probe
   // would miss overflow/underflow induced by finite absolute root dimensions.
   viewportTransform(viewBox,width!==null&&height!==null?width:1,width!==null&&height!==null?height:1,par);
  }catch(e){fail('invalid',e instanceof RangeError?'VIEWPORT_GEOMETRY':'PRESERVE_ASPECT_RATIO');}
  const out=document.implementation.createDocument(SVG,'svg',null),rebuilt=new Map<Element,Element>(),references:Array<{el:Element;attr:string;target:string;kind:'clip'|'use'}>=[];
  // Validate the sole supported stylesheet before expanding its cascade. Styles
  // in discarded subtrees cannot create visible defaults, even when well formed.
  const styles=entries.filter(e=>e.el.localName==='style'&&!e.ancestorRemoved);
  let hasGlobalStyle=false;
  for(const {el,node} of styles){
   currentPath=node.sourcePath;
   if(el.namespaceURI!==SVG){unknown=true;continue;}
   if(el.hasAttribute('type')&&el.getAttribute('type')!=='text/css')fail('invalid','STYLE_TYPE');
   const supportedAttrs=Array.from(el.attributes).every(a=>!a.namespaceURI&&['type','id'].includes(a.localName));
   const m=/^\*\s*\{([^{}]*)\}$/.exec(cssTokens(el.textContent??'').trim());
   const ds=m?declarations(m[1]):[];
   const valid=styles.length===1&&supportedAttrs&&el.parentElement?.namespaceURI===SVG&&el.parentElement.localName==='defs'&&ds.length===2&&ds.some(([k,v])=>k==='stroke-linejoin'&&v==='round')&&ds.some(([k,v])=>k==='stroke-linecap'&&v==='butt');
   if(valid)hasGlobalStyle=true;else unknown=true;
  }
  const markUnknown=()=>{unknown=true;};
  const localRef=(value:string):string|null=>{const match=/^url\(\s*(?:"(#[^"]+)"|'(#[^']+)'|(#[^)\s]+))\s*\)$/i.exec(value);return match?(match[1]??match[2]??match[3]).slice(1):null;};
  const field=(source:Element,target:Element,key:string,raw:string,mode:'presentation'|'css')=>{
   const value=cssTokens(raw).trim();if(!FIELDS.has(key)){markUnknown();return;}
   if(key==='clip-path'&&source.localName==='clipPath'&&value!=='none')fail('invalid','CLIP_DEFINITION_REFERENCE');
   if(/!important|var\(|^(?:initial|unset|revert|revert-layer)$/.test(value)){markUnknown();return;}
   if(value==='inherit'){
    let parent=source.parentElement,found=false;while(parent){if(parent.hasAttribute(key)||declarations(parent.getAttribute('style')??'').some(([k])=>k===key)){found=true;break;}parent=parent.parentElement;}
    if(!found){markUnknown();return;}target.setAttribute(key,value);return;
   }
   if(key==='clip-path'){
    if(value==='none'){target.setAttribute(key,'none');return;}const id=localRef(value);if(id===null){if(/url/i.test(value))fail('invalid','CLIP_REFERENCE');markUnknown();return;}references.push({el:target,attr:key,target:id,kind:'clip'});return;
   }
   if(/url\s*\(/i.test(value)){markUnknown();return;}
   if(key==='font'){
    if(value.includes('/')||!/^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00|(?:ultra-|extra-|semi-)?(?:condensed|expanded))\s+)*[+]?\d*\.?\d+(?:px|pt|in|mm|cm)\s+(?:['"][^'"]+['"]|[a-zA-Z][\w -]*)(?:\s*,\s*(?:['"][^'"]+['"]|[a-zA-Z][\w -]*))*$/.test(value))fail('invalid','FONT_SHORTHAND');
    const css=document.createElement('span').style;css.font=value;if(!css.fontSize||!css.fontFamily)fail('invalid','FONT_SHORTHAND');
    for(const k of ['font-family','font-size','font-style','font-weight','font-stretch','font-variant']){const v=css.getPropertyValue(k);if(v)field(source,target,k,v,'css');}return;
   }
   if(['font-size','stroke-width','stroke-dasharray','stroke-dashoffset'].includes(key)){
    if(/(?:%|em|ex|rem|ch|vw|vh)|calc\(/.test(value)){markUnknown();return;}
    if(key==='stroke-dasharray'&&value==='none'){target.setAttribute(key,value);return;}
    if(key==='stroke-dasharray'&&/(?:^\s*,|,\s*,|,\s*$)/.test(value))fail('invalid','LENGTH_LIST');
    const vals=key==='stroke-dasharray'?value.split(/[\s,]+/):[value];
    if(!vals.length||vals.some(v=>!v))fail('invalid','LENGTH_LIST');
    for(let v of vals){if(key==='stroke-dashoffset'&&v.startsWith('-'))v=v.slice(1);const r=parseAbsoluteLength(v,key==='font-size'?mode:'presentation');if(r.kind!=='valid')fail('invalid','STYLE_LENGTH');}
   }else if(['fill','stroke'].includes(key)){
    if(/^(currentColor|context-fill|context-stroke)$/i.test(value)){markUnknown();return;}
    const named='black silver gray white maroon red purple fuchsia green lime olive yellow navy blue teal aqua orange transparent'.split(' ');
    const rgb=/^rgba?\(\s*([+-]?[\d.]+%?)\s*,\s*([+-]?[\d.]+%?)\s*,\s*([+-]?[\d.]+%?)(?:\s*,\s*([+-]?[\d.]+%?))?\s*\)$/i.exec(value);
    if(value!=='none'&&!/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)&&!named.includes(value.toLowerCase())&&!rgb)fail('invalid','COLOR');
    if(rgb&&rgb.slice(1).filter(Boolean).some(v=>!Number.isFinite(Number(v.replace('%','')))))fail('invalid','COLOR');
   }else if(['opacity','fill-opacity','stroke-opacity','stroke-miterlimit'].includes(key)){
    if(!NUMBER.test(value)||!Number.isFinite(Number(value))||Number(value)<(key==='stroke-miterlimit'?1:0)||(key!=='stroke-miterlimit'&&Number(value)>1))fail('invalid','STYLE_NUMBER');
   }else{
    const enums:Record<string,string[]>={'fill-rule':['nonzero','evenodd'],'stroke-linecap':['butt','round','square'],'stroke-linejoin':['miter','round','bevel'],'text-anchor':['start','middle','end'],display:['inline','none'],visibility:['visible','hidden','collapse'],'vector-effect':['none','non-scaling-stroke'],'font-style':['normal','italic','oblique'],'font-weight':['normal','bold','bolder','lighter',...Array.from({length:9},(_,i)=>String((i+1)*100))],'font-stretch':['normal','ultra-condensed','extra-condensed','condensed','semi-condensed','semi-expanded','expanded','extra-expanded','ultra-expanded'],'font-variant':['normal','small-caps']};
    if(enums[key]&&!enums[key].includes(value))fail('invalid','STYLE_KEYWORD');
    if(key==='font-family'&&!/^(?:['"][^'"]+['"]|[a-zA-Z][\w -]*)(?:\s*,\s*(?:['"][^'"]+['"]|[a-zA-Z][\w -]*))*$/.test(value))fail('invalid','FONT_FAMILY');
   }
   const css=document.createElement('span').style;
   // SVG presentation font-size admits unitless user units; CSSOM's CSS parser
   // needs the equivalent px token only for validation, not for source storage.
   const cssValue=key==='font-size'&&mode==='presentation'&&NUMBER.test(value)?value+'px':value;
   css.setProperty(key,cssValue);if(!css.getPropertyValue(key))fail('invalid','CSSOM_VALUE');target.setAttribute(key,value);
  };
  for(const {el,node,removed} of entries){
   currentPath=node.sourcePath;const tag=el.localName;
   // Unknown features within removed metadata do not affect rendering; danger was scanned above.
   let inMetadata=false,inTextOnly=false;for(let p:Element|null=el;p;p=p.parentElement)if(p.localName==='metadata')inMetadata=true;
   for(let p=el.parentElement;p;p=p.parentElement)if(p.localName==='title'||p.localName==='desc')inTextOnly=true;
   if(inMetadata||inTextOnly)continue;
   if(tag==='style')continue;
   if(removed){if(tag!=='title'&&tag!=='desc')markUnknown();continue;}
   const target=el===root?out.documentElement:out.createElementNS(SVG,tag);rebuilt.set(el,target);node.retained=true;node.sanitizedId='s-'+node.objectId;target.setAttribute('id',node.sanitizedId);
   if(el!==root){const parent=rebuilt.get(el.parentElement!);if(parent)parent.appendChild(target);else {node.retained=false;node.sanitizedId=null;continue;}}
   if(hasGlobalStyle){target.setAttribute('stroke-linecap','butt');target.setAttribute('stroke-linejoin','round');}
   if(tag==='svg'&&el!==root)markUnknown();
   for(const a of el.attributes){
    const key=a.localName,value=a.value;
    if(a.namespaceURI===XMLNS){if(![SVG,XLINK,XML,'http://www.w3.org/1999/02/22-rdf-syntax-ns#','http://purl.org/dc/elements/1.1/','http://creativecommons.org/ns#'].includes(value))markUnknown();continue;}
    if(a.namespaceURI===XML&&key==='space'&&['text','tspan'].includes(tag)){if(!['default','preserve'].includes(value))fail('invalid','XML_SPACE');target.setAttributeNS(XML,'xml:space',value);continue;}
    if(a.namespaceURI&&!(a.namespaceURI===XLINK&&key==='href'&&tag==='use')){markUnknown();continue;}
    if(key==='id')continue;
    if(key==='style')continue;
    if(FIELDS.has(key)){if(hasGlobalStyle&&['stroke-linecap','stroke-linejoin'].includes(key))continue;field(el,target,key,value,'presentation');continue;}
    if(key==='transform'){transform(value);target.setAttribute(key,value);continue;}
    if(!ATTRS[tag]?.includes(key)){markUnknown();continue;}
    if(key==='href'){
     const other=el.getAttribute('href'),xl=el.getAttributeNS(XLINK,'href');if(other!==null&&xl!==null&&other!==xl)fail('invalid','CONFLICTING_HREF');
     if(!value.startsWith('#')||value.length===1)fail('invalid','LOCAL_HREF');references.push({el:target,attr:'href',target:value.slice(1),kind:'use'});continue;
    }
    if(key==='d'){target.setAttribute(key,value);continue;}
    if(['viewBox','preserveAspectRatio'].includes(key)){target.setAttribute(key,value);continue;}
    if(key==='version'&&value!=='1.1')fail('invalid','SVG_VERSION');
    if(key==='clipPathUnits'&&value!=='userSpaceOnUse'){markUnknown();continue;}
    if(['x','y','dx','dy','rotate'].includes(key)&&['text','tspan'].includes(tag)){const ns=numericList(value);if(!ns.length)fail('invalid','POSITION_LIST');if(key==='rotate'&&ns.length>1)markUnknown();}
    else if(key==='points'){const ns=numericList(value);if(!ns.length||ns.length%2)fail('invalid','POINTS');}
    else if(['x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height'].includes(key)&&el!==root){const ns=numericList(value);if(ns.length!==1||(['r','rx','ry','width','height'].includes(key)&&ns[0]<0))fail('invalid','GEOMETRY_LENGTH');}
    target.setAttribute(key,value);
   }
   if(el.hasAttribute('style'))for(const [k,v] of declarations(el.getAttribute('style')!))field(el,target,k,v,'css');
   if(tag==='title'||tag==='desc')target.textContent=el.textContent;
   if(tag==='clipPath'&&Array.from(el.children).some(c=>!GEOMETRY.has(c.localName)||c.hasAttribute('clip-path')||c.hasAttribute('filter')||c.children.length||declarations(c.getAttribute('style')??'').some(([k])=>k==='clip-path'||k==='filter')))fail('invalid','CLIP_CONTENT');
  }
  // Attach text relative to retained source siblings; appending all text at the end
  // would change mixed text/tspan content and its anchor/advance.
  for(const {el} of entries){const target=rebuilt.get(el);if(!target||['title','desc'].includes(el.localName))continue;
   for(const child of el.childNodes)if(child.nodeType===3||child.nodeType===4){
    let next=child.nextSibling,anchor:Element|null=null;
    while(next){if(next.nodeType===1&&rebuilt.has(next as Element)){anchor=rebuilt.get(next as Element)!;break;}next=next.nextSibling;}
    target.insertBefore(out.createTextNode(child.nodeValue??''),anchor);
   }
  }
  for(const r of references){const source=ids.get(r.target);if(!source)fail('invalid','MISSING_REFERENCE');const target=nodeMap.get(source!)!;
   if(!target.retained)fail('invalid','REMOVED_REFERENCE');
   if(r.kind==='clip'){if(source!.localName!=='clipPath')fail('invalid','CLIP_TYPE');}
   else if(!GEOMETRY.has(source!.localName)||source!.parentElement?.localName!=='defs'||source!.children.length)fail('invalid','USE_TYPE');
   r.el.setAttribute(r.attr,r.kind==='clip'?'url(#'+target.sanitizedId+')':'#'+target.sanitizedId);
  }
  // Count safe rendered instances, including each use and clip application. Both
  // potential fill/stroke paints count even when hidden or transparent: this is
  // a conservative work bound, never a visible-object count.
  const originals=new Map([...rebuilt].map(([source,target])=>[target,source]));
  const byId=new Map([...rebuilt.values()].map(el=>[el.id,el]));
  let expandedVectorCommands=0,drawWeight=0;
  const add=(commands:number,weight:number)=>{expandedVectorCommands+=commands;drawWeight+=weight;if(!Number.isSafeInteger(expandedVectorCommands)||expandedVectorCommands>l.maxExpandedVectorCommands)fail('limited','EXPANDED_VECTOR_COMMANDS');if(!Number.isSafeInteger(drawWeight))fail('limited','DRAW_WEIGHT');};
  const clipping=new Set<string>();
  const clip=(el:Element)=>{const id=/^url\(#([^)]*)\)$/.exec(el.getAttribute('clip-path')??'')?.[1];if(id){if(clipping.has(id)||clipping.size>=l.maxDepth)fail('limited','CLIP_EXPANSION_LIMIT');clipping.add(id);const definition=byId.get(id)!;for(const child of definition.children)add(geometryCommands.get(originals.get(child)!)??0,1);clip(definition);clipping.delete(id);}};
  const drawable=(el:Element)=>{add(geometryCommands.get(originals.get(el)!)??0,2);clip(el);};
  const count=(el:Element)=>{
   if(['defs','clipPath','title','desc'].includes(el.localName))return;
   if(GEOMETRY.has(el.localName))drawable(el);
   else {clip(el);if(el.hasAttribute('opacity')&&Number(el.getAttribute('opacity'))<1)add(0,1);if(el.localName==='use'){const href=el.getAttribute('href');if(href)drawable(byId.get(href.slice(1))!);}
    else if(['text','tspan'].includes(el.localName)){let chars=0;for(const child of el.childNodes)if(child.nodeType===3||child.nodeType===4)chars+=(child.nodeValue??'').length;add(0,2*chars);}}
   for(const child of el.children)count(child);
  };count(out.documentElement);
  const resourceCost=Object.freeze({expandedVectorCommands,drawWeight});
  if(unknown)diagnostics.push({code:'UNSUPPORTED_VISUAL_FEATURE',level:'unassessed',sourcePath:null,message:'Unsupported visual features disable all previews and measurements.'});
  const safeLabel=label.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f]/g,'').slice(0,255)||'figure.svg';
  const prepared:PreparedSvg=freezeTree({profileId:'matplotlib-text-svg-v1',sanitizedMarkup:new XMLSerializer().serializeToString(out.documentElement),rootGeometry:{viewBox,originalWidthPx:width,originalHeightPx:height,preserveAspectRatio:par,aspectBasis:width!==null&&height!==null?'root-dimensions':'viewBox'},resourceCost,nodes:entries.map(e=>e.node),diagnostics,inputSha256:sha256(bytes),label:safeLabel,preview:unknown?{status:'disabled',reasonCodes:['UNSUPPORTED_VISUAL_FEATURE']}:{status:'enabled',reasonCodes:[]}});
  budgets.set(prepared,Object.freeze({limits:Object.freeze(l),cost:resourceCost}));return {kind:'accepted',prepared};
 }catch(e){const error=e instanceof InputError?e:new InputError('invalid','INPUT_ENGINE_ERROR');return {kind:error.kind,diagnostics:[{code:error.code,level:'error',sourcePath:currentPath,message:error.code}]};}
}
