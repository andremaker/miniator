#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const cefRoot=process.env.CEF_ROOT;
const bridge=process.env.MINIATOR_CEF_BRIDGE||(cefRoot&&path.join(cefRoot,'Release','miniator_cef_bridge'));
const ffmpeg=process.env.MINIATOR_FFMPEG||'ffmpeg';
const check=(command,args)=>{try{const r=spawnSync(command,args,{encoding:'utf8',timeout:15000});return {ok:r.status===0,value:(r.stdout||r.stderr||'').trim().slice(0,180),error:r.error?.message||null}}catch(e){return {ok:false,error:e.message}}};
const native=fs.existsSync(path.join(root,'engine','atlas_native.node'));
const checks={node:process.version,platform:process.platform,arch:process.arch,cefBridge:bridge&&fs.existsSync(bridge)?{ok:true,path:bridge}:{ok:false,error:'Set CEF_ROOT and build native CEF bridge'},ffmpeg:check(ffmpeg,['-version']),nativeAddon:native?{ok:true}: {ok:false,error:'Run npm run build:native'},dependencies:{}};
for(const dep of ['react','esbuild','typescript']){try{checks.dependencies[dep]=require.resolve(dep,{paths:[path.join(root,'engine')]})}catch{checks.dependencies[dep]='NOT INSTALLED'}}
console.log(JSON.stringify(checks,null,2));
if(!native||!checks.cefBridge.ok||!checks.ffmpeg.ok||Object.values(checks.dependencies).includes('NOT INSTALLED'))process.exitCode=1;
