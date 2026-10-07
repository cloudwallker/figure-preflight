import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('fixtures/manifest.json','utf8'));
const references=JSON.parse(readFileSync('fixtures/text-reference.json','utf8'));
test('all 39 actual files use the production File entry; M20 values positions and no false positives',async({page,browserName})=>{
 test.setTimeout(180000);await page.goto('/app');const output=resolve(process.env.FIGURE_DELIVERY_EVIDENCE??'.cache/delivery',browserName,'matrix');mkdirSync(output,{recursive:true});const rows:any[]=[];
 expect(manifest.actualFileCount).toBe(39);expect(manifest.actualThemeCount).toBe(20);expect(manifest.measurementAcceptanceIds).toHaveLength(20);
 for(const entry of manifest.entries){const file='fixtures/'+entry.file;expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(entry.sha256);const truth=references.files[entry.file]?.cases[0];await page.locator('#width').fill(String(truth?.widthMm??50.8));await page.locator('#file').setInputFiles(file);
  if(entry.expectedParse!=='accepted'){await expect(page.locator('#input-status')).toContainText('输入 '+entry.expectedParse);await expect(page.locator('.preview-panel')).toHaveCount(0);await expect(page.locator('#save-json')).toBeDisabled();await expect(page.locator('#save-html')).toBeDisabled();rows.push({...entry,actualParse:entry.expectedParse});await page.screenshot({path:resolve(output,entry.id+'.png')});continue;}
  await expect(page.locator('#source-label')).toHaveText(entry.file);await expect(page.locator('#input-status')).toContainText('检查完成');
  const pending=page.waitForEvent('download');await page.locator('#save-json').click();const download=await pending;const jsonPath=resolve(output,entry.id+'.json');await download.saveAs(jsonPath);const report=JSON.parse(readFileSync(jsonPath,'utf8'));expect(report.source.inputSha256).toBe(entry.sha256);expect(report.measurement.run.status).toBe(entry.expectedRun);
  if(entry.measurementAcceptanceIds.length){expect(truth).toBeTruthy();const expectedFindings=truth.records.filter((r:any)=>r.expectedStatus==='measured'&&r.finalPt<(r.kind==='text'?6:.25)-1e-6).map((r:any)=>r.objectId+':'+(r.kind==='text'?'SMALL_TEXT':'THIN_STROKE')).sort();expect(report.findings.map((f:any)=>f.id).sort()).toEqual(expectedFindings);
   for(const ref of truth.records){const actual=report.measurement.objects.find((o:any)=>o.objectId===ref.objectId&&o.kind===ref.kind);expect(actual.status).toBe(ref.expectedStatus);if(ref.expectedStatus==='excluded')continue;expect(Math.abs(actual.finalPt-ref.finalPt)).toBeLessThanOrEqual(.01);const b=actual.bounds,edges=[b.x*truth.widthPx,b.y*truth.heightPx,(b.x+b.width)*truth.widthPx,(b.y+b.height)*truth.heightPx];if(ref.kind==='text'){for(const i of [0,1]){expect(edges[i]).toBeGreaterThanOrEqual(ref.envelopeAabb[i]-1);expect(edges[i]).toBeLessThanOrEqual(ref.inkAabb[i]+1);}for(const i of [2,3]){expect(edges[i]).toBeLessThanOrEqual(ref.envelopeAabb[i]+1);expect(edges[i]).toBeGreaterThanOrEqual(ref.inkAabb[i]-1);}}else for(let i=0;i<4;i++)expect(Math.abs(edges[i]-ref.boxAabb[i])).toBeLessThanOrEqual(1);}
   await page.locator('[data-finding]').first().click();await expect(page.locator('[data-selection]')).toHaveCount(4);
  }
  rows.push({id:entry.id,file:entry.file,sha256:entry.sha256,actualParse:'accepted',coverage:report.measurement.coverage,objects:report.measurement.objects,findings:report.findings,measurementAcceptance:entry.measurementAcceptanceIds.length>0});
  await expect(page.locator('#save-html')).toBeEnabled();await page.locator('#results').screenshot({path:resolve(output,entry.id+'.png')});
 }
 writeFileSync(resolve(output,'results.json'),JSON.stringify({browser:browserName,fileCount:rows.length,measurementAcceptanceCount:rows.filter(r=>r.measurementAcceptance).length,rows},null,2));
});
