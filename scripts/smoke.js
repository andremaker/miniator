#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.env.CEF_ROOT && !process.env.MINIATOR_CEF_BRIDGE)throw Error("Set CEF_ROOT or MINIATOR_CEF_BRIDGE");
const output=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-smoke-'));
try{
 const r=spawnSync(process.execPath,[path.join(root,'engine/plan_renderer.js'),'--mode','chosen','--reps','1','--output',output,'--slots','4','--tabs','2'],{encoding:'utf8',timeout:120000,env:process.env});
 if(r.status!==0)throw Error('Render failed: '+r.stderr.slice(-2000)+' '+r.stdout.slice(-1000));
 const summary=JSON.parse(fs.readFileSync(path.join(output,'chosen_summary.json'),'utf8'));
 if(summary.runs?.length!==1)throw Error('Missing timed result');
 const video=path.join(output,'chosen_0.mp4');
 const ffprobe=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'});
 if(ffprobe.status!==0||Number(ffprobe.stdout.trim())<=0)throw Error('Invalid video frames '+ffprobe.stderr);
 console.log('SMOKE PASS',JSON.stringify({frames:Number(ffprobe.stdout.trim()),strategy:summary.selected,total_s:summary.median_s}));
}finally{fs.rmSync(output,{force:true,recursive:true})}
