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
const shim=path.join(root,'remotion_compiler_shim.js');
const originalRemotion=path.join(path.dirname(require.resolve('remotion/package.json')),'dist','esm','index.mjs');
const src=fs.readFileSync(path.join(root,'source',sourceFile),'utf8');
const safeCSSVars=!/\b(?:filter|backdropFilter)\s*:/.test(src);
const source=`import {Hello} from './source/${sourceFile}';\nimport {bootstrap} from './compiled_runtime.js';\nglobalThis.__MINIATOR_STYLE_SAFE_TRANSFORM__=${safeCSSVars};\nbootstrap(Hello);\n`;
fs.writeFileSync(entry,source);
const shimSource=`import {spring,interpolate} from 'remotion-math-original';
export {spring,interpolate};
export function useCurrentFrame(){return globalThis.__MINIATOR_FRAME__}
export function useVideoConfig(){return globalThis.__MINIATOR_VIDEO_CONFIG__}
export function AbsoluteFill() {throw Error('AbsoluteFill marker must be resolved by compiled runtime')}
AbsoluteFill.__miniatorComponent='AbsoluteFill';
export function Sequence(){throw Error('Sequence marker must be resolved by compiled runtime')}
Sequence.__miniatorComponent='Sequence';
`;
fs.writeFileSync(shim,shimSource);
const plugin={name:'remotion-compiled-shim',setup(build){
 build.onResolve({filter:/^remotion$/},()=>({path:shim}));
 build.onResolve({filter:/^remotion-math-original$/},()=>({path:originalRemotion}));
}};
const outfile=path.join(root,'precompiled','entry_compiled.js');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
esbuild.build({entryPoints:[entry],outfile,bundle:true,platform:'browser',format:'iife',target:'chrome120',jsx:'transform',jsxFactory:'globalThis.__miniatorJsx',jsxFragment:'globalThis.__miniatorFragment',plugins:[plugin],define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'}).then(()=>{
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
console.log(JSON.stringify({scene,original:sourceFile,bundle:outfile,size:fs.statSync(outfile).size,source_sha256:hash(path.join(root,'source',sourceFile)),bundle_sha256:hash(outfile)}));
}).catch(e=>{console.error(e);process.exitCode=1});
