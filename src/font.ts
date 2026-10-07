import type {FontStatus,TrustedFontAssets} from './model.ts';
import {sha256} from './sha256.ts';
import coverage from '../assets/font-coverage.json' with {type:'json'};
const glyphs=new Set(coverage.codepoints);
const loaded=new Map<string,FontFace>();
/** Accepts only caller-owned font bytes; input SVG never supplies this argument. */
export async function loadTrustedFont(assets:TrustedFontAssets):Promise<FontStatus>{
 const status:FontStatus={status:'unavailable',family:assets.family,version:assets.version,sha256:assets.sha256,licenseRef:assets.licenseRef,reasonCodes:[]};
 try{
  const bytes=Uint8Array.from(atob(assets.base64),c=>c.charCodeAt(0));
  if(sha256(bytes)!==assets.sha256||assets.sha256!==coverage.sha256||assets.family!=='DejaVu Sans'||assets.version!=='2.35'||!assets.licenseRef){status.reasonCodes=['FONT_ASSET_MISMATCH'];return status;}
  let face=loaded.get(assets.sha256);
  if(!face){face=new FontFace(assets.family,bytes,{style:'normal',weight:'400',stretch:'normal'});await face.load();document.fonts.add(face);loaded.set(assets.sha256,face);}
  await document.fonts.ready;
  if(face.status!=='loaded'||!document.fonts.has(face)){status.reasonCodes=['FONT_LOAD_FAILED'];return status;}
  status.status='loaded';return status;
 }catch{status.reasonCodes=['FONT_LOAD_FAILED'];return status;}
}
/** Pin actual loaded face and cmap; a matching family name alone proves nothing. */
export function textFontReasons(status:FontStatus,style:CSSStyleDeclaration,text:string):string[]{
 const face=loaded.get(status.sha256);
 if(status.status!=='loaded'||!face||face.status!=='loaded'||!document.fonts.has(face))return ['FONT_UNAVAILABLE'];
 if(style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g,'')!=='DejaVu Sans'||!['400','normal'].includes(style.fontWeight)||style.fontStyle!=='normal'||!['normal','100%'].includes(style.fontStretch)||style.fontVariant!=='normal')return ['FONT_FACE_UNVERIFIED'];
 if([...text].some(c=>!glyphs.has(c.codePointAt(0)!)))return ['FONT_GLYPH_UNVERIFIED'];
 return [];
}
