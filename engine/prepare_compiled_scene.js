#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const esbuild=require('esbuild');
const {execFileSync}=require('child_process');
const scene=process.argv[2]||'SeparatedEffects';if(!['Hello_original','SimpleSequences','MovingTiles','ManyCards','GradientMotion','ComplexEffects','SeparatedEffects'].includes(scene))throw Error('Not a corpus scene');
const root=__dirname;const filename=scene==='Hello_original'?'Hello_original.tsx':scene+'.tsx';
fs.copyFileSync(path.join(root,'source',filename),path.join(root,'source','Hello.tsx'));
const fixture=scene==='Hello_original'?{
 scene:'source/Hello.tsx',composition:{width:1920,height:1080,fps:30,durationInFrames:120},reference_mp4_sha256:null,encoder:{codec:'libx264',preset:'ultrafast',crf:23,threads:2,pixelFormat:'yuv420p',fragmentDuration:1000000},adapter:'source/scene_adapter.tsx'
}:['ComplexEffects','SeparatedEffects'].includes(scene)?{scene:'source/Hello.tsx',composition:{width:960,height:540,fps:30,durationInFrames:90},reference_mp4_sha256:'unknown',encoder:{codec:'libx264',preset:'ultrafast',crf:23,threads:2,pixelFormat:'yuv420p',fragmentDuration:1000000},adapter:'source/scene_adapter.tsx'}:JSON.parse(fs.readFileSync(path.join(root,'references',scene+'.json')));
fs.writeFileSync(path.join(root,'scene_fixture.json'),JSON.stringify(fixture,null,2));
for(const [src,target] of [['entry_plan.tsx','entry_plan.js'],['entry_factor.tsx','entry_factor.js'],['entry_factor_css.tsx','entry_factor_css.js'],['entry_packed.tsx','entry_packed.js'],['entry_imperative.ts','entry_direct.js']]){
 esbuild.buildSync({entryPoints:[path.join(root,'source',src)],outfile:path.join(root,'precompiled',target),bundle:true,platform:'browser',format:'iife',target:'chrome120',define:{'process.env.NODE_ENV':'"production"'},logLevel:'error'});
}
execFileSync(process.execPath,[path.join(root,'build_compiled_js.js'),scene],{stdio:'inherit'});
// Static compilation is a conditional optimization, not a mandatory mode.
if(['Hello_original','SimpleSequences','MovingTiles','ManyCards','GradientMotion'].includes(scene))
 execFileSync(process.execPath,[path.join(root,'build_static.js'),scene],{stdio:'inherit'});
else fs.rmSync(path.join(root,'precompiled','entry_static.js'),{force:true});
fixture.reference_mp4_sha256=null;fs.writeFileSync(path.join(root,'scene_fixture.json'),JSON.stringify(fixture,null,2));
const manifestPath=path.join(root,'bundle_manifest.json');const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath)): {format:1,sources:Object.fromEntries(['source/Hello.tsx','source/scene_adapter.tsx','precompiled/entry_plan.js','precompiled/entry_factor.js','source/entry_dom.js'].map(name=>[name,'']))};
for(const file of Object.keys(manifest.sources)){const f=path.join(root,file);if(fs.existsSync(f))manifest.sources[file]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
console.log('PREPARED',scene,fixture.reference_mp4_sha256);
