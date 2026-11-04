"use strict";
// Miniator public process adapter; one-off rendering uses a fresh worker.
// compileComposition() and createSession() provide persistent sessions.
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const engine=path.join(root,'engine');
function execute(script,args=[],options={}){
 if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw new TypeError('args must be strings');
 const env={...process.env,...options.env};
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(engine,script),...args],{cwd:engine,env,stdio:['ignore','pipe','pipe'],signal:options.signal});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{stdout+=chunk;options.onStdout?.(chunk)});
  child.stderr.on('data',chunk=>{stderr+=chunk;options.onStderr?.(chunk)});
  child.on('error',reject);
  child.on('close',(code,signal)=>code===0?resolve({code,stdout,stderr}):reject(Object.assign(new Error(`${script} exited ${signal||code}: ${stderr.slice(-1000)}`),{code,signal,stdout,stderr})));
 });
}
function render({args=[],cefBridgePath,ffmpegPath,env={},signal,onStdout,onStderr}={}){
 return execute('plan_renderer.js',args,{signal,onStdout,onStderr,env:{...env,...(cefBridgePath?{MINIATOR_CEF_BRIDGE:cefBridgePath}:{}),...(ffmpegPath?{MINIATOR_FFMPEG:ffmpegPath}:{})}});
}
function prepareScene(scene,options={}){
 if(!/^(Hello_original|SimpleSequences|MovingTiles|ManyCards|GradientMotion|ComplexEffects|SeparatedEffects)$/.test(scene))throw new Error('Unsupported preparation fixture');
 return execute('prepare_compiled_scene.js',[scene],options);
}
function compileStatic(scene,options={}){
 if(!/^[A-Za-z0-9_]+$/.test(scene))throw new Error('Unsafe scene identifier');
 return execute('build_static.js',[scene],options);
}
module.exports={render,prepareScene,compileStatic};

module.exports.compileComposition=(...args)=>require('./composition').compileComposition(...args);
module.exports.renderComposition=(...args)=>require('./composition').renderComposition(...args);

module.exports.createSession=(...args)=>require('./session').createSession(...args);
