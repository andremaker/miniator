#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const [reference,candidate,minSsim='0.999']=process.argv.slice(2);
if(!reference||!candidate){console.error('Usage: node scripts/fidelity.js reference.mp4 candidate.mp4 [minimum-SSIM]');process.exit(2)}
for(const p of [reference,candidate])if(!fs.existsSync(p))throw Error('Missing video '+p);
const probe=file=>{
 const r=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,nb_read_frames','-of','json',file],{encoding:'utf8',timeout:120000});
 if(r.status!==0)throw Error('ffprobe failed: '+r.stderr);
 const s=JSON.parse(r.stdout).streams?.[0];
 if(!s?.width||!s?.height||!Number(s.nb_read_frames))throw Error('Missing video frames');
 return s;
};
const a=probe(reference),b=probe(candidate);
if(a.width!==b.width||a.height!==b.height||Number(a.nb_read_frames)!==Number(b.nb_read_frames))throw Error('Frame count or dimensions mismatch: '+JSON.stringify({a,b}));
const r=spawnSync(process.env.MINIATOR_FFMPEG||'ffmpeg',['-hide_banner','-i',reference,'-i',candidate,'-lavfi','[0:v][1:v]ssim','-f','null','-'],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
if(r.status!==0)throw Error('FFmpeg SSIM check failed: '+r.stderr.slice(-1500));
const match=[...r.stderr.matchAll(/SSIM[^\n]* All:([\d.]+)/g)].at(-1);
if(!match)throw Error('FFmpeg did not produce SSIM');
const score=Number(match[1]);
console.log(JSON.stringify({reference:path.resolve(reference),candidate:path.resolve(candidate),frames:Number(a.nb_read_frames),width:a.width,height:a.height,ssim:score,threshold:Number(minSsim)},null,2));
if(score<Number(minSsim))process.exitCode=1;
