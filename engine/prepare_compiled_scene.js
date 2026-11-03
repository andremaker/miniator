#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const esbuild=require('esbuild');
const {execFileSync}=require('child_process');
const scene=process.argv[2];if(!['Hello_original','SimpleSequences','MovingTiles','ManyCards','GradientMotion'].includes(scene))throw Error('Not a corpus scene');
const root=__dirname;const filename=scene==='Hello_original'?'Hello_original.tsx':scene+'.tsx';
fs.copyFileSync(path.join(root,'source',filename),path.join(root,'source','Hello.tsx'));
const fixture=scene==='Hello_original'?{
 scene:'source/Hello.tsx',composition:{width:1920,height:1080,fps:30,durationInFrames:120},reference_mp4_sha256:'5d4b9f82ed55a830346bec21748a0a0804f63c0aba843b5db4f90a5546a4c78b',encoder:{codec:'libx264',preset:'ultrafast',crf:23,threads:2,pixelFormat:'yuv420p',fragmentDuration:1000000},adapter:'source/scene_adapter.tsx'
}:JSON.parse(fs.readFileSync(path.join(root,'references',scene+'.json')));
fs.writeFileSync(path.join(root,'scene_fixture.json'),JSON.stringify(fixture,null,2));
for(const [src,target] of [['entry_plan.tsx','entry_plan.js'],['entry_factor.tsx','entry_factor.js'],['entry_factor_css.tsx','entry_factor_css.js']]){
 esbuild.buildSync({entryPoints:[path.join(root,'source',src)],outfile:path.join(root,'precompiled',target),bundle:true,platform:'browser',format:'iife',target:'chrome120',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
}
execFileSync(process.execPath,[path.join(root,'build_compiled_js.js'),scene],{stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'bundle_manifest.json')));
for(const file of Object.keys(manifest.sources))manifest.sources[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.writeFileSync(path.join(root,'bundle_manifest.json'),JSON.stringify(manifest,null,2));
console.log('PREPARED',scene,fixture.reference_mp4_sha256);
