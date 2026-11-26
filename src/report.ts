import type {FigureReport,PreparedSvg,MeasurementReport,Thresholds,ManualReview,TrustedAssets,TrustedFontAssets,PreviewHandle} from './model.ts';
import {validateReportInvariants} from './model.ts';
import {evaluateThresholds} from './rules.ts';
import {createPreview,selectObject,PREVIEW_MODES,MODE_LABELS,whenPreviewReady,savedPreviewState,restoreSavedPreviewState} from './preview.ts';
import {loadTrustedFont} from './font.ts';
import {sha256} from './sha256.ts';
import {preparedBudget,restorePreparedSvg} from './input.ts';

export function buildReport(prepared:PreparedSvg,measured:MeasurementReport,thresholds:Thresholds,review:ManualReview):FigureReport {
 const ordinal=new Map(prepared.nodes.map(n=>[n.objectId,n.ordinal]));
 const measurement=structuredClone(measured);
 measurement.objects.sort((a,b)=>(ordinal.get(a.objectId)??Infinity)-(ordinal.get(b.objectId)??Infinity)||a.kind.localeCompare(b.kind));
 const report:FigureReport={schemaVersion:1,generatedAt:new Date().toISOString(),source:{label:prepared.label.split(/[\\/]/).pop()||'figure.svg',inputSha256:prepared.inputSha256,profileId:prepared.profileId,elementCount:prepared.nodes.length},preview:measurement.run.status==='limited'?{status:'disabled',reasonCodes:[measurement.run.stopReason]}:structuredClone(prepared.preview),measurement,thresholds:{...thresholds},findings:evaluateThresholds(measurement,thresholds).sort((a,b)=>(ordinal.get(a.objectId)??Infinity)-(ordinal.get(b.objectId)??Infinity)||a.ruleId.localeCompare(b.ruleId)),manualReview:{...review},colorModel:{id:'machado',version:'2009-2010',severity:100,sourceUrl:'https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html'}};
 const errors=validateReportInvariants(report);if(errors.length)throw Error('Inconsistent report: '+errors.join(', '));return report;
}

/** Safe for script-data embedding as well as standalone JSON. No SVG/full text is included. */
export function serializeJson(report:FigureReport):string{return escapeJson(report);}
export function escapeJson(value:unknown):string{return JSON.stringify(value,null,2).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}

function element<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className=''):HTMLElementTagNameMap[K]{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;}
function pointDecimals(actualPt:number,thresholdPt:number):number {
 const shortfall = thresholdPt - actualPt;
 // Findings exclude differences of 1e-6 pt or smaller. Keep ordinary values at three decimals.
 return shortfall > 0 ? Math.min(6, Math.max(3, Math.ceil(-Math.log10(shortfall)))) : 3;
}

const selections=new WeakMap<PreparedSvg,string|null>();
export function mountReport(report:FigureReport,prepared:PreparedSvg,target:HTMLElement,font?:TrustedFontAssets):{dispose:()=>void;select:(id:string|null)=>void;ready:Promise<void>}{
 target.replaceChildren();target.dataset.revision=String(report.measurement.revision);target.dataset.sourceHash=report.source.inputSha256;
 const m=report.measurement,heading=element('div','','result-heading'),label=element('h2',report.source.label);label.id='source-label';heading.append(label,element('p',m.finalSize?`${m.finalSize.widthMm.toFixed(2)} × ${m.finalSize.heightMm.toFixed(2)} mm`:'最终尺寸不可用'));target.append(heading);
 const status=m.run.status==='complete'?'检查完成':m.run.status==='partial'?'部分结果':`检查状态：${m.run.status}`;
 const state=element('p',status+(m.run.stopReason?' · '+m.run.stopReason:''),'run-state');state.id='run-state';target.append(state);
 const coverage=element('div','','coverage');coverage.id='coverage';
 for(const [kind,title] of [['text','文字'],['stroke','描边']] as const){const c=m.coverage[kind];coverage.append(element('p',`${title}：已测 ${c.measured} / 已发现 ${c.discovered}；未检测 ${c.unassessed}，排除 ${c.excluded}，待处理 ${c.pending}${c.discovered===0?' · 无适用对象':''}`));}
 coverage.append(element('p',(m.coverage.enumerationComplete?'枚举已结束。':'枚举未结束，当前数量不是整图分母。')+' 字号仅覆盖保留的文字；路径文字仍需人工检查。'));
 const reasons=new Set([...m.coverage.reasonCodes,...m.objects.flatMap(o=>o.reasonCodes),...report.preview.reasonCodes]);if(reasons.size){const detail=element('details');detail.append(element('summary','查看未检测与排除原因'),element('p',[...reasons].join(' · ')));coverage.append(detail);}target.append(coverage);
 const layout=element('div','','result-layout'),side=element('aside','','findings'),grid=element('div','','preview-grid'),selection=element('div','','selection-detail');selection.id='selection-detail';selection.setAttribute('aria-live','polite');
 side.append(element('h3',`已检测到 ${report.findings.length} 项阈值问题`));
 if(!report.findings.length)side.append(element('p',m.run.status==='complete'&&report.preview.status==='enabled'&&(m.coverage.text.measured+m.coverage.stroke.measured)>0?'在已测量对象中，未发现低于当前阈值的字号或线宽。':'当前没有可报告的阈值问题；请结合运行状态和未检测范围查看。'));
 const list=element('div','','finding-list');side.append(list,selection);layout.append(side,grid);target.append(layout);
 const handles:PreviewHandle[]=[],buttons:HTMLButtonElement[]=[];let disposed=false;
 const select=(id:string|null)=>{if(disposed)return;selections.set(prepared,id);target.dataset.selected=id??'';for(const h of handles)selectObject(h,id);for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.objectId===id));selection.replaceChildren();if(id===null)return;
  const objects=m.objects.filter(o=>o.objectId===id),node=prepared.nodes.find(n=>n.objectId===id);selection.append(element('h4','选中对象 '+id),element('p',node?.sourceId?'源 ID：'+node.sourceId:'源 ID：未设置'));
  if(!objects.length)selection.append(element('p','未获得该对象的测量记录。'));
  for(const o of objects){
   const bounds=o.bounds,threshold=o.kind==='text'?report.thresholds.minFontPt:report.thresholds.minStrokePt;
   selection.append(element('p',`${o.kind==='text'?'文字':'描边'} · ${o.status} · ${o.finalPt===null?'数值未检测':o.finalPt.toFixed(pointDecimals(o.finalPt,threshold))+' pt'} · ${bounds?o.locationAccuracy:'无法定位'}${o.reasonCodes.length?' · '+o.reasonCodes.join('、'):''}`));if(bounds&&(bounds.x<0||bounds.y<0||bounds.x+bounds.width>1||bounds.y+bounds.height>1))selection.append(element('p','对象范围超出最终视口；预览按视口裁剪。'));}
 };
 for(const f of report.findings){
  const digits=pointDecimals(f.actualPt,f.thresholdPt);
  const gap=(f.thresholdPt-f.actualPt).toFixed(digits);
  const button=element('button',`${f.ruleId==='SMALL_TEXT'?'小字':'细线'} · ${f.actualPt.toFixed(digits)} pt < ${f.thresholdPt} pt · 差 ${gap} pt`);button.type='button';button.dataset.finding=f.id;button.dataset.objectId=f.objectId;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>select(f.objectId));buttons.push(button);list.append(button);}
 if(font&&font.sha256!==m.environment.font.sha256)throw Error('FONT_SNAPSHOT_MISMATCH');
 for(const mode of PREVIEW_MODES){const panel=element('section','','preview-panel'),title=element('h3',MODE_LABELS[mode]),viewport=element('div','','preview-viewport');panel.append(title,viewport);grid.append(panel);if(report.preview.status==='disabled'){viewport.append(element('p','预览停用：'+report.preview.reasonCodes.join('、'),'preview-disabled'));}else handles.push(createPreview(prepared,mode,viewport,{finalSize:m.finalSize,objects:m.objects,font,revision:m.revision,onSelect:e=>select(e.objectId)}));}
 target.append(element('p','配色由人工复核。四幅模拟不生成配色通过结论。','muted'));
 const previewStatus=element('p','预览准备中…');previewStatus.id='preview-status';previewStatus.setAttribute('role','status');target.append(previewStatus);
 const ready=Promise.all(handles.map(whenPreviewReady)).then(()=>{if(disposed)throw Error('PREVIEW_CANCELLED');previewStatus.textContent=report.preview.status==='disabled'?'预览已停用；可保存报告。':'预览已就绪';target.dataset.previewReady='true';}).catch(()=>{if(!disposed)previewStatus.textContent='预览未完成，HTML 保存暂不可用。';throw Error('PREVIEW_UNAVAILABLE');});void ready.catch(()=>{});
 const owned=Array.from(target.childNodes);select(selections.get(prepared)??null);
 return {select,ready,dispose:()=>{disposed=true;for(const h of handles)h.dispose();for(const node of owned)node.parentNode===target&&node.remove();}};
}

export function renderHtml(report:FigureReport,prepared:PreparedSvg,assets:TrustedAssets):string{
 if(report.source.inputSha256!==prepared.inputSha256)throw Error('Source snapshot mismatch');
 const saved=structuredClone(prepared);saved.label=report.source.label;saved.nodes=saved.nodes.filter(n=>n.retained);saved.preview=structuredClone(report.preview);if(saved.preview.status==='disabled')saved.sanitizedMarkup='';
 const script=assets.appJs.replace(/<\/script/gi,'<\\/script'),hash=btoa(sha256(new TextEncoder().encode(script)).match(/../g)!.map(b=>String.fromCharCode(parseInt(b,16))).join(''));
 const data=escapeJson({report,prepared:saved,font:assets.font,limits:preparedBudget(prepared)?.limits,previews:report.preview.status==='disabled'?null:savedPreviewState(prepared,report.measurement,assets.font),selected:selections.get(prepared)??null});
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>FigurePreflight 本地报告</title><style>${assets.css.replace(/<\/style/gi,'<\\/style')}</style></head><body><header><p class="eyebrow">FIGURE PREFLIGHT / SAVED REPORT</p><h1>图件检查报告</h1><p>回放保存的数值与状态。HTML 包含图中内容，可离线打开。</p></header><main><section id="results"></section><section class="manual"><h2>人工配色复核记录</h2><p id="saved-review"></p><p id="saved-note"></p><p id="saved-font"></p><p id="saved-time"></p></section></main><script type="application/json" id="saved-data">${data}</script><script>${script}</script></body></html>`;
}

if(typeof document!=='undefined'&&document.getElementById('saved-data')){
 const data=JSON.parse(document.getElementById('saved-data')!.textContent!);
 void loadTrustedFont(data.font).then(async status=>{data.prepared=restorePreparedSvg(data.prepared,data.limits);if(data.report.preview.status==='enabled')await restoreSavedPreviewState(data.prepared,data.report.measurement,data.font,data.previews);const view=mountReport(data.report,data.prepared,document.getElementById('results')!,data.font);await view.ready;view.select(typeof data.selected==='string'&&data.prepared.nodes.some((n:any)=>n.objectId===data.selected)?data.selected:null);document.getElementById('saved-review')!.textContent='保存的人工状态：'+data.report.manualReview.status;document.getElementById('saved-note')!.textContent=data.report.manualReview.note;document.getElementById('saved-font')!.textContent='回放字体：'+status.status+' · '+status.version;document.getElementById('saved-time')!.textContent='保存时间：'+data.report.generatedAt;document.documentElement.dataset.replayReady='true';}).catch(()=>{document.getElementById('results')!.textContent='报告回放失败，保存数据未被改写。';});
}
