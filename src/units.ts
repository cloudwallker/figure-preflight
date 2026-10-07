import type {LengthOutcome,Matrix6,SimilarityOutcome,ViewBox} from './model.ts';
const number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const absolute=new RegExp('^('+number+')(px|pt|in|mm|cm)?$','i');
export function parseAbsoluteLength(raw:string,mode:'root'|'presentation'|'css'):LengthOutcome {
 const match=absolute.exec(raw.trim());if(!match)return {kind:'unassessed',code:'UNSUPPORTED_LENGTH'};
 const q=Number(match[1]),unit=(match[2]??'').toLowerCase();
 if(!Number.isFinite(q)||(mode==='root'?q<=0:q<0)||(!unit&&mode==='css'&&q!==0))return {kind:'unassessed',code:'INVALID_LENGTH'};
 const cssPx=q*({px:1,pt:96/72,in:96,mm:96/25.4,cm:96/2.54,'':1}[unit]!);
 return Number.isFinite(cssPx)?{kind:'valid',cssPx,sourceUnit:unit}:{kind:'unassessed',code:'INVALID_LENGTH'};
}
export function viewportTransform(v:ViewBox,widthPx:number,heightPx:number,par:string):Matrix6 {
 if(![v.x,v.y,v.width,v.height,widthPx,heightPx].every(Number.isFinite)||Math.min(v.width,v.height,widthPx,heightPx)<=0)throw Error('Invalid viewport');
 const match=/^(none|x(Min|Mid|Max)Y(Min|Mid|Max))(?:\s+(meet|slice))?$/.exec(par.trim()||'xMidYMid meet');
 if(!match)throw Error('Invalid preserveAspectRatio');
 let a=widthPx/v.width,d=heightPx/v.height,e=-v.x*a,f=-v.y*d;
 if(match[1]!=='none') {a=d=(match[4]==='slice'?Math.max:Math.min)(a,d);const align={Min:0,Mid:.5,Max:1};e=-v.x*a+(widthPx-v.width*a)*align[match[2] as keyof typeof align];f=-v.y*d+(heightPx-v.height*d)*align[match[3] as keyof typeof align];}
 if(![a,d,e,f].every(Number.isFinite)||a<=0||d<=0)throw new RangeError('Unrepresentable viewport');
 return {a,b:0,c:0,d,e:Object.is(e,-0)?0:e,f:Object.is(f,-0)?0:f};
}
export function classifySimilarity(m:Matrix6):SimilarityOutcome {
 if(!Object.values(m).every(Number.isFinite))return {kind:'unassessed',reason:'nonfinite'};
 const x=Math.hypot(m.a,m.b),y=Math.hypot(m.c,m.d);
 if(!Number.isFinite(x)||!Number.isFinite(y))return {kind:'unassessed',reason:'nonfinite'};
 if(x===0||y===0)return {kind:'unassessed',reason:'singular'};
 const ax=m.a/x,ay=m.b/x,bx=m.c/y,by=m.d/y;
 if(ax*by-ay*bx===0)return {kind:'unassessed',reason:'singular'};
 if(Math.abs(x-y)>1e-6*Math.max(x,y)||Math.abs(ax*bx+ay*by)>1e-6)return {kind:'unassessed',reason:'nonuniform'};
 return {kind:'similarity',scale:x/2+y/2};
}
