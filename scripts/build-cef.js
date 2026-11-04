#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sdk=process.env.CEF_ROOT;
if(!sdk||!fs.existsSync(path.join(sdk,'cmake','FindCEF.cmake')))throw Error('CEF_ROOT must point to an externally unpacked CEF Minimal SDK');
if(sdk===root||sdk.startsWith(root+path.sep))throw Error('CEF_ROOT must be outside the Miniator repository');
const build=path.resolve(process.env.MINIATOR_CEF_BUILD_DIR||path.join(require('node:os').tmpdir(),'miniator-cef-build'));
if(build===root||build.startsWith(root+path.sep))throw Error('CEF build directory must be outside the repository');
for(const [bin,args] of [['cmake',['-S',path.join(root,'cef'),'-B',build,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DCEF_ROOT='+sdk]],['cmake',['--build',build,'--parallel','2']]]){
 const r=spawnSync(bin,args,{stdio:'inherit'});if(r.error||r.status!==0)throw r.error||Error('CEF native build failed');
}
console.log('CEF bridge executable: '+path.join(sdk,'Release','miniator_cef_bridge'));
