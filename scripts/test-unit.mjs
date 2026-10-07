import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const filters=process.argv.slice(2);
const files=readdirSync('tests').filter(f=>f.endsWith('.test.ts')&&(!filters.length||filters.some(s=>f.includes(s))));
if(!files.length)throw new Error('No tests selected');
process.exit(spawnSync(process.execPath,['--test',...files.map(f=>'tests/'+f)],{stdio:'inherit'}).status??1);
