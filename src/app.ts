import {parseSvg} from './input.ts';
import {measureSvg} from './measure.ts';
import {loadTrustedFont} from './font.ts';
import {DEFAULT_LIMITS} from './model.ts';
import type {PreparedSvg,MeasurementReport,FigureReport,TrustedAssets,ManualReview,Thresholds} from './model.ts';
import {buildReport,mountReport,serializeJson,renderHtml} from './report.ts';

const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const file=get<HTMLInputElement>('file'),width=get<HTMLInputElement>('width'),fontInput=get<HTMLInputElement>('font-threshold'),strokeInput=get<HTMLInputElement>('stroke-threshold'),status=get('input-status'),results=get('results'),cancel=get<HTMLButtonElement>('cancel'),html=get<HTMLButtonElement>('save-html'),json=get<HTMLButtonElement>('save-json');
let revision=0,prepared:PreparedSvg|null=null,measurement:MeasurementReport|null=null,report:FigureReport|null=null,controller:AbortController|null=null,view:ReturnType<typeof mountReport>|null=null,timer:ReturnType<typeof setTimeout>|undefined,thresholdTimer:ReturnType<typeof setTimeout>|undefined;
let trustedAssets:TrustedAssets|null=null;
const assetsPromise=fetch('/trusted-assets.json').then(r=>{if(!r.ok)throw Error('本地资产加载失败');return r.json() as Promise<TrustedAssets>;}).then(a=>trustedAssets=a);
const fontPromise=assetsPromise.then(a=>loadTrustedFont(a.font));
void fontPromise.then(f=>{if(!revision)status.textContent=f.status==='loaded'?'准备就绪。选择或拖入保留文字的 SVG。':'字体不可用，位置将按未验证字体处理。';}).catch(()=>{status.textContent='本地字体资产加载失败，请重新构建应用。';});
const thresholds=():Thresholds=>({minFontPt:fontInput.valueAsNumber,minStrokePt:strokeInput.valueAsNumber});
const review=():ManualReview=>({status:get<HTMLSelectElement>('review-status').value as ManualReview['status'],note:get<HTMLTextAreaElement>('review-note').value});
function clear(){view?.dispose();view=null;measurement=null;report=null;html.disabled=json.disabled=true;results.removeAttribute('data-revision');results.removeAttribute('data-source-hash');results.replaceChildren();}
function begin(){revision++;controller?.abort();controller=null;clearTimeout(timer);clearTimeout(thresholdTimer);clear();cancel.disabled=true;return revision;}
function refresh(){if(!prepared||!measurement||!trustedAssets)return;try{const next=buildReport(prepared,measurement,thresholds(),review());const previous=view;report=next;view=mountReport(next,prepared,results,trustedAssets.font);previous?.dispose();const currentView=view,token=revision;html.disabled=true;json.disabled=false;void view.ready.then(()=>{if(view===currentView&&token===revision&&report)html.disabled=false;}).catch(()=>{});}catch{report=null;html.disabled=json.disabled=true;status.textContent='请输入有效阈值：字号 1–72 pt，线宽 0.01–10 pt。';}}
async function measure(token:number){if(!prepared||token!==revision)return;const current=prepared;const w=width.valueAsNumber;
 if(!Number.isFinite(w)||w<1||w>500){status.textContent='最终宽度须在 1–500 mm 范围内。';return;}
 status.textContent='正在检查…';cancel.disabled=false;const abort=new AbortController();controller=abort;
 try{const fontStatus=await fontPromise;if(token!==revision)return;
  const measured=await measureSvg(current,{widthMm:w,profileId:current.profileId,revision:token,fontStatus},get('measure-stage'),abort.signal);
  if(token!==revision)return;measurement=measured;controller=null;cancel.disabled=true;status.textContent=measured.run.status==='complete'?'检查完成。请查看阈值问题与覆盖范围。':`检查已停止：${measured.run.status} / ${measured.run.stopReason}`;refresh();
 }catch{if(token===revision){status.textContent='检查无法启动，请检查本地资产并重新导入。';cancel.disabled=true;}}
}
async function importFile(input:File){const token=begin();prepared=null;status.textContent='正在读取 '+input.name+'…';
 if(input.size>DEFAULT_LIMITS.maxInputBytes){status.textContent='输入 limited：文件超过 2 MiB 上限。';return;}
 try{const bytes=new Uint8Array(await input.arrayBuffer());if(token!==revision)return;const started=performance.now(),outcome=parseSvg(bytes,input.name);results.dataset.parseMs=String(performance.now()-started);
  if(outcome.kind!=='accepted'){status.textContent=`输入 ${outcome.kind}：`+outcome.diagnostics.map(d=>d.code+' '+d.message).join('；');return;}
  prepared=outcome.prepared;get<HTMLSelectElement>('review-status').value='not-reviewed';get<HTMLTextAreaElement>('review-note').value='';await measure(token);
 }catch{if(token===revision)status.textContent='无法读取此文件，请重新选择。';}}
file.addEventListener('change',()=>{const selected=file.files?.[0];file.value='';if(selected)void importFile(selected);});
const drop=get('drop-zone');drop.addEventListener('dragover',e=>{e.preventDefault();});drop.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer?.files[0])void importFile(e.dataTransfer.files[0]);});
width.addEventListener('input',()=>{const token=begin();status.textContent='尺寸已更改，等待重新检查…';timer=setTimeout(()=>{void measure(token);},150);});
for(const input of [fontInput,strokeInput])input.addEventListener('input',()=>{html.disabled=json.disabled=true;clearTimeout(thresholdTimer);thresholdTimer=setTimeout(refresh,150);});
for(const id of ['review-status','review-note'])get(id).addEventListener('input',()=>{if(prepared&&measurement&&report)report=buildReport(prepared,measurement,thresholds(),review());});
cancel.addEventListener('click',()=>{controller?.abort();status.textContent='正在取消…';});
get('example').addEventListener('click',async()=>{try{const r=await fetch('/bad.svg');if(!r.ok)throw Error();width.value='85';await importFile(new File([await r.arrayBuffer()],'01-bad.svg',{type:'image/svg+xml'}));}catch{status.textContent='示例加载失败。';}});
function save(contents:string,type:string,name:string){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
json.addEventListener('click',()=>{if(report&&!json.disabled)save(serializeJson(report),'application/json','figure-preflight.json');});
html.addEventListener('click',async()=>{if(!report||!prepared||html.disabled)return;const snapshot=report,source=prepared,token=revision;const assets=await assetsPromise;if(token!==revision||report!==snapshot||html.disabled)return;save(renderHtml(snapshot,source,assets),'text/html','figure-preflight.html');});
