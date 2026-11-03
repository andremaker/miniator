#!/usr/bin/env node
'use strict';
const {render,prepareScene,compileStatic}=require('../src');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const [cmd,...args]=process.argv.slice(2);
const help=`Miniator (experimental rendering engine)

  miniator doctor                            Validate local toolchain
  miniator prepare <fixture-name>            Build the selected fixture's bundles
  miniator compile-static <fixture-name>     Compile the fixture's static DOM variant
  miniator render [renderer flags]           Invoke preserved renderer CLI
  miniator help

Example: miniator render --mode chosen --reps 1 --output ./output
Requires MINIATOR_BROWSER and a native addon (npm run build:native).
`;
(async()=>{
 if(!cmd||cmd==='help'||cmd==='--help'){console.log(help);return}
 if(cmd==='doctor'){const r=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/doctor.js')],{stdio:'inherit'});process.exitCode=r.status??1;return}
 const fn=cmd==='render'?()=>render({args,onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):cmd==='prepare'?()=>prepareScene(args[0],{onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):cmd==='compile-static'?()=>compileStatic(args[0],{onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):null;
 if(!fn)throw Error('Unknown subcommand: '+cmd+'\n'+help);
 if(cmd!=='render'&&args.length!==1)throw Error(`${cmd} expects exactly one fixture`);
 await fn();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
