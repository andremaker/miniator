"use strict";
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');

const {render}=require('./index');
const {createSession}=require('./session');
const root=path.resolve(__dirname,'..');
const entry=path.join(root,'engine/source/entry_external.tsx');
function positiveInt(x,name,max){if(!Number.isSafeInteger(x)||x<1||x>max)throw new TypeError(`Invalid ${name}`)}
function validateOptions(options){
 if(!options||typeof options!=='object'||typeof options.source!=='string')throw new TypeError('source path required');
 const source=path.resolve(options.source);
 if(!fs.statSync(source).isFile())throw new Error('Composition source must be a file');
 const {width,height,fps,durationInFrames}=options;
 positiveInt(width,'width',8192);positiveInt(height,'height',8192);
 positiveInt(fps,'fps',240);positiveInt(durationInFrames,'durationInFrames',1000000);
 return {source,width,height,fps,durationInFrames};
}
function validateProps(props){
 if(props===null||Array.isArray(props)||typeof props!=='object')throw new TypeError('props must be an object');
 return JSON.stringify(props); // also rejects cycles and unsupported serialization
}
async function compileComposition(options){
 const config=validateOptions(options);
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-composition-'));
 let closed=false;
 try{
  const srcDir=path.join(workspace,'source'),precompiled=path.join(workspace,'precompiled');
  fs.mkdirSync(srcDir);fs.mkdirSync(precompiled);
  fs.copyFileSync(entry,path.join(srcDir,'entry_external.tsx'));
  const adapter=`import Scene from ${JSON.stringify(config.source)};\nexport {Scene};\n`;
  fs.writeFileSync(path.join(srcDir,'scene_adapter.tsx'),adapter);
  const esbuild=require('esbuild');
  await esbuild.build({entryPoints:[path.join(srcDir,'entry_external.tsx')],outfile:path.join(precompiled,'entry_plan.js'),
   bundle:true,platform:'browser',format:'iife',target:'es2022',nodePaths:[path.join(root,'node_modules')],
   define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  for(const name of ['entry_factor.js','entry_factor_css.js','entry_direct.js','entry_packed.js'])
   fs.writeFileSync(path.join(precompiled,name),'void 0;');
  fs.writeFileSync(path.join(srcDir,'entry_dom.js'),'void 0;');
  const encoder={codec:'libx264',preset:'ultrafast',crf:23,threads:2,pixelFormat:'yuv420p',fragmentDuration:1000000};
  const fixture={scene:'source/scene_adapter.tsx',adapter:'source/scene_adapter.tsx',
   source_sha256:crypto.createHash('sha256').update(fs.readFileSync(config.source)).digest('hex'),
   composition:{width:config.width,height:config.height,fps:config.fps,durationInFrames:config.durationInFrames},
   reference_mp4_sha256:'unverified',encoder};
  fs.writeFileSync(path.join(workspace,'scene_fixture.json'),JSON.stringify(fixture));
  fs.writeFileSync(path.join(workspace,'bundle_manifest.json'),JSON.stringify({format:1,sources:{}}));
  const compilationHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(precompiled,'entry_plan.js'))).digest('hex');
  let next=0;const sessions=new Set();
  return {
   source:config.source,composition:fixture.composition,compilationHash,
   async render({output,props={},cefBridgePath,ffmpegPath,tabs=2,slots=4,optimizationPolicy='auto',strategyRegistry,signal,onStdout,onStderr}={}){
    if(closed)throw new Error('Composition has been closed');
    if(typeof output!=='string'||!output.trim())throw new TypeError('output path required');
    positiveInt(tabs,'tabs',8);positiveInt(slots,'slots',32);
    const id=next++,dir=path.join(workspace,'jobs',String(id));fs.mkdirSync(dir,{recursive:true});
    const propsPath=path.join(dir,'props.json');fs.writeFileSync(propsPath,validateProps(props));
    const video=path.resolve(output);
    await render({args:['--mode','external','--fixture',path.join(workspace,'scene_fixture.json'),
      '--output',dir,'--video',video,'--input-json',propsPath,'--tabs',String(tabs),'--slots',String(slots),
      '--optimization-policy',optimizationPolicy,...(strategyRegistry?['--strategy-registry',path.resolve(strategyRegistry)]:[])],
      env:{MINIATOR_WORKSPACE:workspace},cefBridgePath,ffmpegPath,signal,onStdout,onStderr});
    return JSON.parse(fs.readFileSync(path.join(dir,'render_summary.json'),'utf8'));
   },
   createSession({tabs=2,slots=4,cefBridgePath,ffmpegPath,optimizationPolicy='auto',strategyRegistry}={}){
    if(closed)throw new Error('Composition has been closed');
    positiveInt(tabs,'tabs',8);positiveInt(slots,'slots',32);
    const worker=createSession({tabs,slots,cefBridgePath,ffmpegPath,workspace,
     fixture:path.join(workspace,'scene_fixture.json'),parameterized:true,
     optimizationPolicy,strategyRegistry});
    sessions.add(worker);
    let finished=false;
    return {ready:worker.ready,async render({output,props={}}={}){
     if(finished)throw Error('Session is closed');
     if(typeof output!=='string'||!output.trim())throw new TypeError('output path required');
     validateProps(props);
     return worker.render({output:path.resolve(output),props});
    },async close(){if(finished)return;finished=true;
     try{await worker.close()}finally{sessions.delete(worker)}},
    };
   },
   close(){if(!closed){if(sessions.size)throw Error('Close active sessions before disposing the composition');
    closed=true;fs.rmSync(workspace,{recursive:true,force:true})}},
  };
 }catch(error){fs.rmSync(workspace,{recursive:true,force:true});throw error}
}
async function renderComposition(config,job){const compiled=await compileComposition(config);
 try{return await compiled.render(job)}finally{compiled.close()}}
module.exports={compileComposition,renderComposition};
