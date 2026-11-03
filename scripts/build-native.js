#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.platform!=='linux')throw Error('Native POSIX shm addon currently supports Linux only.');
const nodeDir=path.dirname(path.dirname(process.execPath));
const headers=[process.env.MINIATOR_NODE_HEADERS,path.join(nodeDir,'include','node'),'/usr/include/node'].filter(Boolean).find(d=>fs.existsSync(path.join(d,'node_api.h')));
if(!headers)throw Error('Node API headers not found. Set MINIATOR_NODE_HEADERS to the directory containing node_api.h.');
const compiler=process.env.CXX||'g++';
const source=path.join(root,'native','atlas_native.cc');
const output=path.join(root,'engine','atlas_native.node');
const tmp=output+'.tmp-'+process.pid;
const args=['-std=c++17','-O3','-fPIC','-shared','-DNAPI_VERSION=8','-I'+headers,source,'-o',tmp,'-lrt'];
const result=spawnSync(compiler,args,{stdio:'inherit'});
if(result.error||result.status!==0){try{fs.rmSync(tmp,{force:true})}catch{};throw result.error||Error('Native build failed: exit '+result.status)}
fs.renameSync(tmp,output);
const native=require(output);
for(const method of ['openPool','closePool','extractTile','extractTileGrid']){
 if(typeof native[method]!=='function')throw Error('Missing native export '+method);
}
console.log('Built '+path.relative(root,output)+' with '+compiler+' using '+headers);
