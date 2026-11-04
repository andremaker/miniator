#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),esbuild=require('esbuild'),crypto=require('crypto');
const compileStart=performance.now();
const root=__dirname;const scene=process.argv[2]||'Hello_original';
const filename=scene+'.tsx';const src=path.join(root,'source',filename);
if(!fs.existsSync(src))throw Error('Missing '+src);
const generated=path.join(root,'source','generated_static.tsx');
const {compileDependency}=require('./dependency_transform');
const analysis=compileDependency(src,generated);
const analysisEnd=performance.now();
const safeCSSVars=!/\b(?:filter|backdropFilter)\s*:/.test(fs.readFileSync(src,'utf8'));
const entry=path.join(root,'static_entry.js');
fs.writeFileSync(entry,`import {Hello} from './source/generated_static.tsx';\nimport {bootstrap} from './static_runtime.js';\nglobalThis.__MINIATOR_STYLE_SAFE_TRANSFORM__=${safeCSSVars};\nbootstrap(Hello);\n`);

const plugin={name:'miniator-timeline-compiler',setup(build){build.onResolve({filter:/^\.\/timeline$/},()=>({path:path.join(root,'compiler_timeline.js')}));}};
const outfile=path.join(root,'precompiled','entry_static.js');
esbuild.build({entryPoints:[entry],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome120',plugins:[plugin],jsx:'transform',jsxFactory:'globalThis.__miniatorJsx',jsxFragment:'globalThis.__miniatorFragment',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'}).then(()=>console.log(JSON.stringify({analysisSummary:{dynamicBindings:analysis.dynamicBindings,styleFields:analysis.dynamicStyleFields,textNodes:analysis.dynamicTextNodes},analysisProcessMs:+(analysisEnd-compileStart).toFixed(2),bundleMs:+(performance.now()-analysisEnd).toFixed(2),totalCompileMs:+(performance.now()-compileStart).toFixed(2),scene,bytes:fs.statSync(outfile).size,sourceSha:crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex')}))).catch(e=>{console.error(e);process.exitCode=1});
