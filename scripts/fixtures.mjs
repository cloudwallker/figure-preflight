import {spawnSync} from 'node:child_process';
const python=process.env.FIGURE_PYTHON??(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const args=process.argv[2]==='verify'?['--test','tests/export-profile.test.mjs']:['tools/generate_fixtures.py'];
const command=process.argv[2]==='verify'?process.execPath:python;
process.exit(spawnSync(command,args,{stdio:'inherit',env:{...process.env,FIGURE_PYTHON:python}}).status??1);
