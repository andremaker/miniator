#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const browser=process.env.MINIATOR_BROWSER||process.env.REMOTION_BROWSER;
const ffmpeg=process.env.MINIATOR_FFMPEG||'ffmpeg';
const check=(command,args)=>{try{const r=spawnSync(command,args,{encoding:'utf8',timeout:15000});return {ok:r.status===0,value:(r.stdout||r.stderr||'').trim().slice(0,180),error:r.error?.message||null}}catch(e){return {ok:false,error:e.message}}};
const native=fs.existsSync(path.join(root,'engine','atlas_native.node'));
const checks={node:process.version,platform:process.platform,arch:process.arch,patchedBrowser:browser?check(browser,['--version']):{ok:false,error:'MINIATOR_BROWSER not set'},ffmpeg:check(ffmpeg,['-version']),nativeAddon:native?{ok:true}: {ok:false,error:'Run npm run build:native'},dependencies:{}};
for(const dep of ['remotion','react','esbuild','typescript']){try{checks.dependencies[dep]=require.resolve(dep,{paths:[path.join(root,'engine')]})}catch{checks.dependencies[dep]='NOT INSTALLED'}}
console.log(JSON.stringify(checks,null,2));
if(!native||!checks.patchedBrowser.ok||!checks.ffmpeg.ok||Object.values(checks.dependencies).includes('NOT INSTALLED'))process.exitCode=1;
