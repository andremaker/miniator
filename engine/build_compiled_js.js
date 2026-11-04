#!/usr/bin/env node
'use strict';
// Build a standalone, React-free runtime from the original TSX composition.
// The original scene's TSX source is not edited or specialized.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),esbuild=require('esbuild');
const root=__dirname;const scene=process.argv[2]||'Hello_original';
const sourceFile=scene==='Hello_original'?'Hello_original.tsx':scene+'.tsx';
if(!fs.existsSync(path.join(root,'source',sourceFile)))throw Error('Missing scene '+sourceFile);
const runtime=path.join(root,'compiled_runtime.js');
const entry=path.join(root,'compiler_entry.js');
const src=fs.readFileSync(path.join(root,'source',sourceFile),'utf8');
const safeCSSVars=!/\b(?:filter|backdropFilter)\s*:/.test(src);
const source=`import {Hello} from './source/${sourceFile}';\nimport {bootstrap} from './compiled_runtime.js';\nglobalThis.__MINIATOR_STYLE_SAFE_TRANSFORM__=${safeCSSVars};\nbootstrap(Hello);\n`;
fs.writeFileSync(entry,source);

const plugin={name:'miniator-timeline-compiler',setup(build){build.onResolve({filter:/^\.\/timeline$/},()=>({path:path.join(root,'compiler_timeline.js')}));}};
const outfile=path.join(root,'precompiled','entry_compiled.js');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
esbuild.build({entryPoints:[entry],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome120',plugins:[plugin],jsx:'transform',jsxFactory:'globalThis.__miniatorJsx',jsxFragment:'globalThis.__miniatorFragment',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'}).then(()=>{
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
console.log(JSON.stringify({scene,original:sourceFile,bundle:outfile,size:fs.statSync(outfile).size,source_sha256:hash(path.join(root,'source',sourceFile)),bundle_sha256:hash(outfile)}));
}).catch(e=>{console.error(e);process.exitCode=1});
