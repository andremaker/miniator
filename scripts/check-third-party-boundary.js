#!/usr/bin/env node
'use strict';
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const names=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const bad=[];
for(const name of names){
 if(/(?:^|\/)(?:node_modules|precompiled|sdk|Release|Resources)(?:\/|$)|\.(?:node|so|a|pak|tar|bz2|zip)$/.test(name))bad.push('Embedded binary/vendor source: '+name);
 const file=path.join(root,name);
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())continue;
 if(/(?:\.js|\.tsx?|\.json|\.md|\.cc|\.h|\.yml|\.yaml|\.gitignore)$/.test(name)&&/\x72\x65\x6d\x6f\x74\x69\x6f\x6e/i.test(fs.readFileSync(file,'utf8')))bad.push('Forbidden framework reference: '+name);
}
if(bad.length){console.error(bad.join('\n'));process.exitCode=1}else console.log('Boundary PASS: CEF SDK external, no imported comparator code');
