#!/usr/bin/env node
'use strict';
// Prevent accidentally committing generated bundles containing external library code.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const names=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
const bannedName=/^(?:node_modules\/|engine\/precompiled\/)|(?:^|\/)remotion\/(?:dist|src)\/|\.node$|(?:^|\/)remotion_compiler_shim\.js$/;
const errors=[];
for(const name of names){
 if(bannedName.test(name)){errors.push(name);continue;}
 const file=path.join(root,name);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())continue;
 if(fs.statSync(file).size>3000000){errors.push(`Unexpected large tracked file: ${name}`);continue;}
 const ext=path.extname(name);
 if(!['.js','.ts','.tsx','.mjs','.cjs'].includes(ext))continue;
 const body=fs.readFileSync(file,'utf8');
 if(/\/node_modules\/remotion\/dist\/|\/remotion\/dist\/esm\//.test(body))errors.push(`Bundled Remotion source marker: ${name}`);
}
if(errors.length){console.error('Third-party source boundary FAILED\n'+errors.join('\n'));process.exit(1)}
console.log(`Third-party source boundary OK (${names.length} tracked files; generated bundles untracked)`);
