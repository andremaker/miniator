"use strict";
const path=require('node:path');const {spawn}=require('node:child_process');
const readline=require('node:readline');
const engine=path.join(__dirname,'../engine');
function createSession({cefBridgePath,ffmpegPath,tabs=2,slots=4,fixture,plan,workspace,parameterized=false,optimizationPolicy='auto',strategyRegistry}={}){
 if(!Number.isInteger(tabs)||tabs<1||tabs>8||!Number.isInteger(slots)||slots<1||slots>32)throw new TypeError('Invalid session concurrency');
 const args=[path.join(engine,'plan_renderer.js'),'--mode',parameterized?'external-session':'session','--tabs',String(tabs),'--slots',String(slots),'--reps','1'];
 if(fixture)args.push('--fixture',path.resolve(fixture));
 if(plan)args.push('--session-plan',path.resolve(plan));
 if(!['auto','off'].includes(optimizationPolicy))throw new TypeError('optimizationPolicy must be auto|off');
 args.push('--optimization-policy',optimizationPolicy);
 if(strategyRegistry)args.push('--strategy-registry',path.resolve(strategyRegistry));
 if(parameterized&&!workspace)throw new TypeError('Parameterized sessions require an isolated workspace');
 const child=spawn(process.execPath,args,{cwd:engine,env:{...process.env,...(cefBridgePath?{MINIATOR_CEF_BRIDGE:cefBridgePath}:{}),...(ffmpegPath?{MINIATOR_FFMPEG:ffmpegPath}:{}),...(workspace?{MINIATOR_WORKSPACE:workspace}:{})},
  stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
 let next=0,ready=false,closed=false,stderr='';const requests=new Map();
 let resolveExit;const exited=new Promise(resolve=>{resolveExit=resolve});
 let resolveReady,rejectReady;const started=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
 function shutdown(){if(closed)return;closed=true;
  try{if(process.platform==='win32')child.kill();else process.kill(-child.pid,'SIGTERM')}catch{}
 }
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2048)});
 const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
 lines.on('line',line=>{
  if(!line.startsWith('MINIATOR_SESSION '))return;
  let data;try{data=JSON.parse(line.slice(17))}catch{return}
  if(data.event==='ready'){ready=true;resolveReady();return}
  const request=requests.get(data.id);if(!request)return;
  requests.delete(data.id);
  if(data.ok)request.resolve(data.result||{closed:true});else request.reject(new Error(data.error));
 });
 child.on('error',e=>{rejectReady(e);for(const r of requests.values())r.reject(e);requests.clear()});
 child.on('close',(code)=>{
  closed=true;resolveExit();const error=new Error(`Miniator session exited (${code}): ${stderr}`);
  if(!ready)rejectReady(error);for(const request of requests.values())request.reject(error);requests.clear();
 });
 async function send(action,body={}){
  await started;if(closed)throw new Error('Miniator session closed');
  const id=++next;return new Promise((resolve,reject)=>{
   requests.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,action,...body})+'\n',e=>{if(e){requests.delete(id);reject(e)}});
  });
 }
 return {ready:started,render:({output,props})=>{
  if(typeof output!=='string'||!output)throw new TypeError('output required');
  return send('render',{output,...(parameterized?{props:props??{}}:{})});
 },async close(){if(closed)return;
  try{await send('close');await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))])}finally{shutdown()}}};
}
module.exports={createSession};
