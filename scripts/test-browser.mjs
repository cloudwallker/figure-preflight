import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),cli='node_modules/@playwright/test/cli.js';
const run=(args)=>{const result=spawnSync(process.execPath,[cli,'test','--max-failures=1',...args],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);};
if(args.some(a=>a==='--config'||a.startsWith('--config=')))run(args);
else if(args.some(a=>/^(?:tests[/\\])?(?:measure|font|text-location|responsiveness)(?:\.browser\.spec\.ts)?$/.test(a)))run(['--config','playwright.measure.config.ts',...args]);
else if(args.length)run(args);
else {run([]);run(['--config','playwright.measure.config.ts']);run(['--config','playwright.delivery.config.ts']);}
