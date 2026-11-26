import type {FontStatus,TrustedFontAssets} from './model.ts';
import {sha256} from './sha256.ts';
import coverage from '../assets/font-coverage.json' with {type:'json'};
const glyphs=new Set(coverage.codepoints);
// The font profile pins one face. Keep only its verified encoding for this document.
let loaded: {face: FontFace; base64: string} | undefined;
/** Accepts only caller-owned font bytes; input SVG never supplies this argument. */
export async function loadTrustedFont(assets:TrustedFontAssets):Promise<FontStatus>{
 const {family, version, sha256: hash, licenseRef, base64} = assets;
 const status:FontStatus={status:'unavailable',family,version,sha256:hash,licenseRef,reasonCodes:[]};
 try{
  if(hash!==coverage.sha256||family!=='DejaVu Sans'||version!=='2.35'||!licenseRef){
   status.reasonCodes=['FONT_ASSET_MISMATCH'];return status;
  }
  let face=loaded?.face;
  if(!face||base64!==loaded?.base64){
   const binary=atob(base64),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   if(sha256(bytes)!==hash){status.reasonCodes=['FONT_ASSET_MISMATCH'];return status;}
   if(!face){
    const candidate=await new FontFace(family,bytes,{style:'normal',weight:'400',stretch:'normal'}).load();
    face=loaded?.face??candidate;
    if(!loaded){document.fonts.add(face);loaded={face,base64};}
   }
  }
  await document.fonts.ready;
  if(face.status!=='loaded'||!document.fonts.has(face)){status.reasonCodes=['FONT_LOAD_FAILED'];return status;}
  status.status='loaded';return status;
 }catch{status.reasonCodes=['FONT_LOAD_FAILED'];return status;}
}
/** Pin actual loaded face and cmap; a matching family name alone proves nothing. */
export function textFontReasons(status:FontStatus,style:CSSStyleDeclaration,text:string):string[]{
 const face=loaded?.face;
 if(status.status!=='loaded'||status.sha256!==coverage.sha256||!face||face.status!=='loaded'||!document.fonts.has(face))return ['FONT_UNAVAILABLE'];
 if(style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g,'')!=='DejaVu Sans'||!['400','normal'].includes(style.fontWeight)||style.fontStyle!=='normal'||!['normal','100%'].includes(style.fontStretch)||style.fontVariant!=='normal')return ['FONT_FACE_UNVERIFIED'];
 if([...text].some(c=>!glyphs.has(c.codePointAt(0)!)))return ['FONT_GLYPH_UNVERIFIED'];
 return [];
}
