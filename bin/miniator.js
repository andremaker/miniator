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
  miniator render <composition.tsx> --width 960 --height 540 --fps 30 --frames 90 --output video.mp4
  miniator render [renderer flags]           Invoke preserved renderer CLI
  miniator help

Example: miniator render --mode chosen --reps 1 --output ./output
Requires CEF_ROOT (external CEF SDK/bridge) and a native addon (npm run build:native).
`;
(async()=>{
 if(!cmd||cmd==='help'||cmd==='--help'){console.log(help);return}
 if(cmd==='render'&&args[0]&&!args[0].startsWith('-')){
  const source=args[0];const flag=(key,def)=>{const i=args.indexOf(key);return i<0?def:args[i+1]};
  const {renderComposition}=require('../src');
  const propsPath=flag('--props',null);
  const props=propsPath?require('node:fs').readFileSync(path.resolve(propsPath),'utf8'):null;
  const report=await renderComposition({source,width:Number(flag('--width',0)),height:Number(flag('--height',0)),
    fps:Number(flag('--fps',30)),durationInFrames:Number(flag('--frames',0))},
    {output:flag('--output',null),props:props?JSON.parse(props):{},
     tabs:Number(flag('--tabs',2)),slots:Number(flag('--slots',4)),
     optimizationPolicy:flag('--optimization-policy','auto'),
     strategyRegistry:flag('--strategy-registry',null)});
  console.log(JSON.stringify({output:report.video,frames:report.output_frames,elapsed:report.total_s}));return;
 }
 if(cmd==='doctor'){const r=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/doctor.js')],{stdio:'inherit'});process.exitCode=r.status??1;return}
 const fn=cmd==='render'?()=>render({args,onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):cmd==='prepare'?()=>prepareScene(args[0],{onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):cmd==='compile-static'?()=>compileStatic(args[0],{onStdout:s=>process.stdout.write(s),onStderr:s=>process.stderr.write(s)}):null;
 if(!fn)throw Error('Unknown subcommand: '+cmd+'\n'+help);
 if(cmd!=='render'&&args.length!==1)throw Error(`${cmd} expects exactly one fixture`);
 await fn();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
