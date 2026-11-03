#!/usr/bin/env node
'use strict';
// No scene-specific positions, text, animation logic, ROI or background are
// embedded here. Input composition and optimization plan are data files.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const {spawn,execFileSync}=require('child_process');
const {once}=require('events');
const {performance}=require('perf_hooks');
const native=require('./atlas_native.node');
const {infer: inferNumericScene} = require('./runtime_math');
const {predictCandidates,sceneComplexity}=require('./atlas_capacity_planner');
const {compileTemplateAtlas}=require('./predictive_atlas_plan');
const ROOT=__dirname;
const args=process.argv.slice(2);
const opt=(s,d)=>{const i=args.indexOf(s);return i<0?d:args[i+1]};
const has=s=>args.includes(s);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=x=>JSON.parse(fs.readFileSync(x,'utf8'));
const n4=x=>Math.round(x*10000)/10000;
const browser=process.env.MINIATOR_BROWSER||process.env.REMOTION_BROWSER;
if(!browser)throw Error('Set MINIATOR_BROWSER to a compatible patched Chromium executable (requires POSIX shared-memory capture)');
const fixturePath=opt('--fixture',path.join(ROOT,'scene_fixture.json'));
const planPath=opt('--plan',path.join(ROOT,'compiled','renderplan.json'));
const out=opt('--output',path.join(ROOT,'benchmarks'));
const repetitions=Number(opt('--reps','5'));
const tabCount=Number(opt('--tabs','1'));
const slotCount=Number(opt('--slots','12'));
let atlasColumns=Number(opt('--atlas-columns',String(slotCount)));
const padding=Number(opt('--padding','5'));
const mode=opt('--mode','render');
let pipelineMode=opt('--pipeline','off'); // off or on: overlap next Chromium capture with current FFmpeg writes
if(!['off','on'].includes(pipelineMode))throw Error('Invalid --pipeline: on|off');
const domMode=opt('--dom-mode','react'); // react or factor; factor re-evaluates live source per job
if(!['react','factor','factorcss','direct','css','compiledjs','compiledcss','staticjs','staticcss'].includes(domMode))throw Error('Invalid --dom-mode');
let visualCacheMode=opt('--visual-cache','off'); // off | build | on, keyed to immutable compiled inputs
if(!['off','build','on'].includes(visualCacheMode))throw Error('Invalid --visual-cache');
const layerReuse=opt('--layer-reuse','off'); // off or plan
if(!['off','plan'].includes(layerReuse))throw Error('Invalid --layer-reuse');
const repeatPolicy=opt('--repetition','plan'); // plan or off; always allowed to opt out
const tabLifecycle=opt('--tab-lifecycle','reused'); // reused (default) or new
if(!['reused','new'].includes(tabLifecycle))throw Error('Invalid --tab-lifecycle: reused|new');
const tabCache=new Map();
const predictiveAtlasEnabled=opt('--predictive-atlas','off')==='on';
const predictiveTemplateCache=new Map();
const runtimeProbeCache=new Map();
let probeLifecycle=opt('--probe-lifecycle','new');
if(!['new','reused'].includes(probeLifecycle))throw Error('--probe-lifecycle new|reused');
const visualAssetCache=new Map(); // Load and SHA-check a precompiled layer asset only once per browser-worker process.
const fastViewport=opt('--fast-viewport','off')==='on';
const backgroundPriority=opt('--background-priority','normal');
const ffFilterThreads=Number(opt('--filter-threads','0'));
const earlyEncoder=opt('--early-encoder','off')==='on';
let filterBeforePad=opt('--filter-before-pad','off')==='on';
const copyCurrentSurface=opt('--copy-current-surface','off')==='on';
const sharedMemUsage=opt('--shared-mem','tmp');
const headlessArgs=['--no-sandbox','--headless=new','--disable-gpu',...(sharedMemUsage==='tmp'?['--disable-dev-shm-usage']:[]),'--remotion-shared-memory-capture','--no-first-run','--remote-debugging-port=0',
 ...(backgroundPriority==='high'?['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']:[])];
if(!['normal','high'].includes(backgroundPriority)||!['tmp','shm'].includes(sharedMemUsage)||![0,1,2,4].includes(ffFilterThreads))throw Error('Invalid experimental flags');
const source=fs.readFileSync(path.join(ROOT,'precompiled','entry_plan.js'),'utf8');
const domSource=fs.readFileSync(path.join(ROOT,'source','entry_dom.js'),'utf8');
const factorSource=fs.readFileSync(path.join(ROOT,'precompiled','entry_factor.js'),'utf8');
const compiledJsSource=fs.existsSync(path.join(ROOT,'precompiled','entry_compiled.js'))?fs.readFileSync(path.join(ROOT,'precompiled','entry_compiled.js'),'utf8'):'';
const staticSource=fs.existsSync(path.join(ROOT,'precompiled','entry_static.js'))?fs.readFileSync(path.join(ROOT,'precompiled','entry_static.js'),'utf8'):'';
const packedSource=fs.existsSync(path.join(ROOT,'precompiled','entry_packed.js'))?fs.readFileSync(path.join(ROOT,'precompiled','entry_packed.js'),'utf8'):'';
const imperativeSource=fs.readFileSync(path.join(ROOT,'precompiled','entry_direct.js'),'utf8');
const factorCssSource=fs.readFileSync(path.join(ROOT,'precompiled','entry_factor_css.js'),'utf8');
const fixture=read(fixturePath);
const comp=fixture.composition;
const expected=fixture.reference_mp4_sha256;
const bundleManifest=read(path.join(ROOT,'bundle_manifest.json'));
if(['runtime','runtime-infer','runtime-compare'].includes(mode))for(const [filename,digest] of Object.entries(bundleManifest.sources)){
 if(sha(fs.readFileSync(path.join(ROOT,filename)))!==digest)throw Error('Scene or bundle changed: rebuild the JS renderer before benchmarking '+filename);
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-plan-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sanityInt=(v,field,max)=>{if(!Number.isSafeInteger(v)||v<=0||v>max)throw Error(`Invalid ${field}: ${v}`)};
sanityInt(comp.width,'width',8192);sanityInt(comp.height,'height',8192);
sanityInt(comp.durationInFrames,'duration',1000000);sanityInt(comp.fps,'fps',240);
sanityInt(tabCount,'tabs',8);sanityInt(slotCount,'slots',32);sanityInt(atlasColumns,'atlas columns',32);
if(!Number.isInteger(padding)||padding<0||padding>32)throw Error('Invalid padding');
if(!['plan','off'].includes(repeatPolicy))throw Error('Unknown repetition policy');
const browserVersion=execFileSync(browser,['--version'],{encoding:'utf8'}).trim();
function fingerprints(){return {
  scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),
  fixture_sha256:sha(fs.readFileSync(fixturePath)),
  adapter_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.adapter))),
  renderer_bundle_sha256:sha(source),
  dom_renderer_sha256:sha(domSource),
  factor_renderer_sha256:sha(factorSource),
  engine_sha256:sha(fs.readFileSync(__filename)),
  native_addon_sha256:sha(fs.readFileSync(path.join(ROOT,'atlas_native.node'))),
  browser_version:browserVersion,
  composition_sha256:sha(JSON.stringify(comp)),
  encoder_sha256:sha(JSON.stringify(fixture.encoder)),
};}
class CDP {
 constructor(ws){this.ws=ws;this.closed=false;this.id=0;this.pending=new Map();
  ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data)}catch{return};if(!m.id)return;
   const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);
   if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);});
  ws.addEventListener('close',()=>{this.closed=true;for(const p of this.pending.values())p.reject(Error('CDP closed'));this.pending.clear();});
 }
 send(method,params={},sessionId){return new Promise((resolve,reject)=>{
  if(this.closed)return reject(Error('CDP closed'));
  const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method))},15000);
  this.pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});
  this.ws.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
}
async function evaluate(cdp,sid,expression){const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sid);
 if(r.exceptionDetails)throw Error('Browser evaluation error '+JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function launch(){const proc=spawn(browser,[...headlessArgs,'--user-data-dir='+tmp],{stdio:['ignore','ignore','pipe']});
 let stderr='';proc.stderr.on('data',v=>{stderr=(stderr+v.toString()).slice(-20000)});
 let url;for(let i=0;i<160;i++){url=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];if(url)break;
  if(proc.exitCode!==null)throw Error('Chromium exit '+proc.exitCode+' '+stderr);await sleep(50);}
 if(!url)throw Error('Chromium failed to start '+stderr);
 const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 return {proc,ws,cdp:new CDP(ws)};}
async function stop(b){if(b){try{await b.cdp.send('Browser.close')}catch{}try{b.ws.close()}catch{}if(b.proc.exitCode===null)b.proc.kill();}
 try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}}
function bgCss(bgra){const x=bgra>>>0;const b=x&255,g=(x>>>8)&255,r=(x>>>16)&255,a=x>>>24;
 if(a!==255)throw Error('Only opaque constant backgrounds are supported');
 return [r,g,b].map(z=>z.toString(16).padStart(2,'0')).join('');}
function makeConfig(capture,slots,columns=slots,regions=null){return {composition:comp,capture,execution:{slots,columns,...(regions?{allowExperimentalPacking:true,containment:'clip-paint',copyMode:'react'}:{})},...(regions?{regions}:{})};}
function planDigest(plan){return sha(JSON.stringify({version:plan.version,fingerprints:plan.fingerprints,composition:plan.composition,background:plan.background,capture:plan.capture,domReplay:plan.domReplay,optimizations:plan.optimizations,execution:plan.execution,expected_mp4_sha256:plan.expected_mp4_sha256}));}
function verifiedPlan(plan){if(!plan.plan_digest||plan.plan_digest!==planDigest(plan))throw Error('Compiled plan metadata was modified after validation; recompile');
 if(plan.version!==2||!plan.validated||plan.expected_mp4_sha256!==expected)throw Error('Plan not verified');
 for(const [k,v]of Object.entries(fingerprints()))if(plan.fingerprints[k]!==v)throw Error('Stale plan: '+k);
 const c=plan.capture;
 for(const k of ['x','y','width','height'])if(!Number.isInteger(c[k])||c[k]<0)throw Error('Invalid capture geometry '+k);
 if(c.width===0||c.height===0||c.x+c.width>comp.width||c.y+c.height>comp.height)throw Error('Out-of-range capture');
 if(plan.background.mode!=='solid'&&plan.background.mode!=='none')throw Error('Unknown background mode');
 if(plan.background.mode==='none'&& (c.x!==0||c.y!==0||c.width!==comp.width||c.height!==comp.height))throw Error('Full frame needed without reconstruction');
 if(plan.optimizations?.elementReuse!==false||!['snapshot-replay','runtime-dom-factor',false].includes(plan.optimizations?.staticDOMSharing))
  throw Error('Unimplemented optimization must be disabled in the plan');
 const visual=plan.optimizations.visualCache;
 if(visual){
   if(visual.type!=='upper-band-raster'||!Number.isInteger(visual.splitY)||visual.splitY<=0||visual.splitY>=c.height||visual.maps?.length!==comp.durationInFrames||!Array.isArray(visual.hashes)||!visual.filename||!visual.content_sha256)throw Error('Invalid visual cache plan');
 }
 const layer=plan.optimizations.layerReuse;
 if(layer){if(layer.type!=='stable-upper-band'||!Number.isInteger(layer.stableFrom)||!Number.isInteger(layer.splitY)||layer.stableFrom<0||layer.stableFrom>=comp.durationInFrames||layer.splitY<1||layer.splitY>=c.height)throw Error('Malformed stable-band plan');}
 const repetition=plan.optimizations.frameRepetition;
 if(repetition!==false){
  if(!repetition||repetition.type!=='identical-trailing-frames'||!Number.isInteger(repetition.start)||
    !Number.isInteger(repetition.clones)||repetition.start<0||repetition.clones<1||
    repetition.start+repetition.clones!==comp.durationInFrames-1)throw Error('Malformed repetition plan');
 }
 return plan;}
async function tabOpen(cdp,capture,slots,bg,domSnapshots=null,bundleMode='react',columns=slots,regions=null){const t0=performance.now(),aw=capture.width*columns,ah=capture.height*Math.ceil(slots/columns);
 sanityInt(aw,'atlas width',32768);sanityInt(ah,'atlas height',8192);
 const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',width:aw,height:ah});
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
 await cdp.send('Page.enable',{},sessionId);await cdp.send('Runtime.enable',{},sessionId);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:aw,height:ah,deviceScaleFactor:1,mobile:false},sessionId);
 const tree=await cdp.send('Page.getFrameTree',{},sessionId);
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>*,*::before,*::after{box-sizing:border-box}html,body{padding:0;margin:0;overflow:hidden;background:#${bg}}#app{position:absolute;left:0;top:0}</style></head><body><div id="app"></div></body></html>`;
 await cdp.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html},sessionId);
 const conf=makeConfig(capture,slots,columns,regions);
 if(domSnapshots)conf.domSnapshots=domSnapshots;
 await evaluate(cdp,sessionId,'window.__MINIATOR_PLAN__='+JSON.stringify(conf));
 if(['compiledjs','compiledcss','staticjs','staticcss'].includes(bundleMode)){
  await evaluate(cdp,sessionId,'window.__MINIATOR_COMPILED_STYLE_MODE__='+JSON.stringify((bundleMode==='compiledcss'||bundleMode==='staticcss')?'css':'direct'));
 }
 await evaluate(cdp,sessionId,(regions?packedSource:domSnapshots?domSource:bundleMode==='factor'?factorSource:bundleMode==='factorcss'?factorCssSource:(bundleMode==='staticjs'||bundleMode==='staticcss')?staticSource:(bundleMode==='compiledjs'||bundleMode==='compiledcss')?compiledJsSource:source)+'\n//# sourceURL=plan_scene.js');
 if(bundleMode==='direct'||bundleMode==='css'){
   await evaluate(cdp,sessionId,`window.__MINIATOR_UPDATE_METHOD__=${JSON.stringify(bundleMode)}`);
   await evaluate(cdp,sessionId,imperativeSource+'\n//# sourceURL=miniator_imperative.js');
 }
 await evaluate(cdp,sessionId,'window.remotionAtlasReady()');
 const framePool=await cdp.send('Page.remotionCreateFramePool',{slotCount:2,slotCapacity:aw*ah*4+64,preferredBackend:'posix-shm'},sessionId);
 if(framePool.backend!=='posix-shm')throw Error('Patched Chromium POSIX shared memory unavailable');
 const shm=native.openPool(framePool.sharedMemoryName,framePool.slotCapacity,framePool.slotCount);
 return {targetId,sessionId,shm,width:aw,height:ah,columns,setup_s:(performance.now()-t0)/1000};}
async function tabClose(cdp,t){try{await cdp.send('Page.remotionDestroyFramePool',{},t.sessionId)}catch{}
 try{native.closePool(t.shm)}catch{}try{await cdp.send('Target.closeTarget',{targetId:t.targetId})}catch{}}
async function capture(cdp,tab,captureCfg,start,slots,round,callback){
 const total=comp.durationInFrames;
 const frames=await evaluate(cdp,tab.sessionId,`window.drawBatch(${start},${total},${slots})`);
 const target=Array.from({length:slots},(_,i)=>Math.min(start+i,total-1));
 if(JSON.stringify(frames)!==JSON.stringify(target))throw Error('Timeline order failure');
 const id='plan-'+tab.targetId+'-'+round;
 const captureParams={remotionFrameSlot:0,remotionFrameId:id,format:'png',fromSurface:true,captureBeyondViewport:fastViewport, ...(fastViewport?{remotionFastViewport:true,optimizeForSpeed:true,clip:{x:0,y:0,width:tab.width,height:tab.height,scale:1}}:{}), ...(copyCurrentSurface?{remotionCopyCurrentSurface:true}:{})};
 const result=await cdp.send('Page.captureScreenshot',captureParams,tab.sessionId);
 if(!result.remotionFrame||result.remotionFrame.stride!==tab.width*4)throw Error('Invalid raw shared-memory capture');
 try{return await callback(result.remotionFrame)}finally{await cdp.send('Page.remotionReleaseFrame',{slot:0,frameId:id},tab.sessionId);}
}
// Precompilation only. Determine which horizontal pixel bands stop changing
// while the rest of the scene continues. No video frames are stored in the plan.
async function analyzeStableBand(cdp,captureCfg,bg){
 const st=performance.now();const tab=await tabOpen(cdp,captureCfg,1,bg);
 const lastChange=new Int32Array(captureCfg.height).fill(-1);
 const rowBytes=captureCfg.width*4;let prev=null;
 try{for(let frame=0;frame<comp.durationInFrames;frame++){
  const tile=await capture(cdp,tab,captureCfg,frame,1,frame,m=>native.extractTile(tab.shm,0,tab.width,tab.height,m.stride,0,captureCfg.width,captureCfg.height,0));
  if(prev)for(let y=0;y<captureCfg.height;y++){
   const begin=y*rowBytes;if(!tile.subarray(begin,begin+rowBytes).equals(prev.subarray(begin,begin+rowBytes)))lastChange[y]=frame;
  }
  prev=tile;
 }}finally{await tabClose(cdp,tab)}
 // Restrict to a top band, because a bottom band requires a different FFmpeg
 // reconstruction arrangement. Candidate selection is generic pixel analysis.
 let best=null,upper=-1;
 for(let split=1;split<captureCfg.height-1;split++){
  upper=Math.max(upper,lastChange[split-1]);
  let lower=-1;for(let y=split;y<captureCfg.height;y++)lower=Math.max(lower,lastChange[y]);
  if(upper<0||upper>=lower)continue;
  const score=split*(lower-upper-1);
  if(score<=0)continue;
  if(!best||score>best.score)best={type:'stable-upper-band',stableFrom:upper,splitY:split,score,analysis_s:n4((performance.now()-st)/1000),validation:'reference-mp4-sha256',inputScope:'compiled-scene-and-validated-inputs'};
 }
 return best;
}
async function compile(cdp){const started=performance.now();
 const full={x:0,y:0,width:comp.width,height:comp.height};
 const tab=await tabOpen(cdp,full,1,'000000');
 let minX=comp.width,minY=comp.height,maxX=0,maxY=0,bg=null,changes=0,scanS=0;
 const frameHashes=[]; // analysis metadata only, never store rendered image/DOM content
 const domSnapshots=[]; const enableSnapshotReplay=has('--allow-snapshot-replay');
 try{for(let i=0;i<comp.durationInFrames;i++){
  const t0=performance.now();
  const scanned=await capture(cdp,tab,full,i,1,i,m=>({
    scan:native.inspectFrame(tab.shm,0,comp.width,comp.height,m.stride),
    frameHash:sha(native.extractTile(tab.shm,0,comp.width,comp.height,m.stride,0,comp.width,comp.height,0)),
  }));
  const {scan,frameHash}=scanned;frameHashes.push(frameHash);
  scanS+=(performance.now()-t0)/1000;
  if(enableSnapshotReplay){
    const markup=await evaluate(cdp,tab.sessionId,"document.getElementById('app').firstElementChild.firstElementChild.innerHTML");
    if(typeof markup!=='string')throw Error('Invalid compile-time DOM snapshot');
    domSnapshots.push(markup);
  }
  if(bg===null)bg=scan.background_bgra;
  if(bg!==scan.background_bgra)throw Error('Nonconstant background sample; cannot compile solid reconstruction');
  if(scan.changed_pixels){changes++;minX=Math.min(minX,scan.x);minY=Math.min(minY,scan.y);
   maxX=Math.max(maxX,scan.x+scan.width);maxY=Math.max(maxY,scan.y+scan.height);}
 }}finally{await tabClose(cdp,tab)}
 let stableFrame=comp.durationInFrames-1;
 while(stableFrame>0&&frameHashes[stableFrame-1]===frameHashes.at(-1))stableFrame--;
 const trailingRepeat=comp.durationInFrames-1-stableFrame;
 const repeatInstruction=trailingRepeat>=2?{type:'identical-trailing-frames',start:stableFrame,
  clones:trailingRepeat,validation:'complete-timeline-pixel-hash',
  inputScope:'compiled-scene-only'}:false;
 const bgcolor=bgCss(bg);
 const candidate=changes?{x:Math.max(0,minX-padding),y:Math.max(0,minY-padding),
   width:Math.min(comp.width,maxX+padding)-Math.max(0,minX-padding),
   height:Math.min(comp.height,maxY+padding)-Math.max(0,minY-padding)}:full;
 const worthwhile=candidate.width*candidate.height<full.width*full.height*0.8;
 const selected=worthwhile?candidate:full;
 const band=worthwhile&&has('--analyze-layer-reuse')?await analyzeStableBand(cdp,selected,bgcolor):false;
 let visualCache=false;
 if(visualCacheMode==='build' && worthwhile && band){
  const visDir=path.join(ROOT,'visual_cache');fs.mkdirSync(visDir,{recursive:true});
  const stripBytes=selected.width*band.splitY*4;const unique=[],hashes=[],maps=[],lookups=new Map();
  const t0=performance.now(),vtab=await tabOpen(cdp,selected,1,bgcolor);
  try{for(let f=0;f<comp.durationInFrames;f++){
   const tile=await capture(cdp,vtab,selected,f,1,f,m=>native.extractTile(vtab.shm,0,vtab.width,vtab.height,m.stride,0,selected.width,selected.height,0));
   const part=tile.subarray(0,stripBytes),h=sha(part);
   let n=lookups.get(h);if(n===undefined){n=unique.length;lookups.set(h,n);unique.push(Buffer.from(part));hashes.push(h);}maps.push(n);
  }}finally{await tabClose(cdp,vtab)}
  const data=Buffer.concat(unique);const id=sha(JSON.stringify({scene:fingerprints().scene_sha256,capture:selected,band:band.splitY,hashes}));
  const filename=`upper_band_${id}.bgra`;fs.writeFileSync(path.join(visDir,filename),data);
  visualCache={type:'upper-band-raster',splitY:band.splitY,filename,content_sha256:sha(data),
    hashes,maps,unique_layers:unique.length,layer_bytes:stripBytes,bytes:data.length,
    creation_s:n4((performance.now()-t0)/1000),inputScope:'exact-compiled-inputs-only',
    notes:'Only visual upper band, not full video frames or counter pixels'};
  console.log('VISUAL_ASSET',JSON.stringify({unique:unique.length,bytes:data.length,creation_s:visualCache.creation_s}));
 }
 const plan={version:2,created_at:new Date().toISOString(),fingerprints:fingerprints(),composition:comp,
  background:worthwhile?{mode:'solid',color:bgcolor}:{mode:'none'},
  capture:selected,analysis:{observed_bounds:changes?{x:minX,y:minY,width:maxX-minX,height:maxY-minY}:null,
    nonempty_frames:changes,frames_scanned:comp.durationInFrames,padding,scan_s:n4(scanS)},
  execution:{preferredTabs:tabCount,preferredSlots:slotCount},
  optimizations:{staticBackgroundReconstruction:worthwhile,roi:worthwhile,staticDOMSharing:false,
   frameRepetition:repeatInstruction,elementReuse:false,layerReuse:band,visualCache},
  domReplay:{enabled:false,snapshots:domSnapshots},
  expected_mp4_sha256:expected,validated:false};
 console.log('ANALYSIS',JSON.stringify({capture:plan.capture,background:plan.background,repetition:repeatInstruction,analysis_s:n4((performance.now()-started)/1000)}));
 const validationPath=path.join(out,'compiled_validation.mp4');
 let validation=await render(cdp,plan,validationPath,1,slotCount,null,null);
 if(!validation.correct && plan.background.mode==='solid'){
  // A conservative fall back: no ROI optimization if Chromium composition
  // differs at even one encoded output byte.
  console.log('ROI_REJECTED',validation.hash);
  plan.capture=full;plan.background={mode:'none'};plan.optimizations.roi=false;
  plan.optimizations.staticBackgroundReconstruction=false;
  validation=await render(cdp,plan,validationPath,1,1,null,null);
 }
 if(validation.correct&&band){
  const trialPath=path.join(out,'layer_reuse_validation.mp4');
  const trial=await render(cdp,plan,trialPath,1,slotCount,null,null,'react','plan');
  plan.analysis.layer_reuse_proof={correct:trial.correct,seconds:trial.total_s,hash:trial.hash};
  if(!trial.correct){plan.optimizations.layerReuse=false;console.log('LAYER_REJECTED',trial.hash);}else console.log('LAYER_VALIDATED',JSON.stringify(band));
  if(!has('--keep-mp4'))fs.rmSync(trialPath,{force:true});
 }
 if(validation.correct&&!has('--skip-factor-validation')){
  const trialPath=path.join(out,'factor_validation.mp4');
  const trial=await render(cdp,plan,trialPath,1,slotCount,null,null,'factor','off');
  plan.analysis.dom_factor_proof={correct:trial.correct,seconds:trial.total_s,hash:trial.hash};
  if(trial.correct){plan.optimizations.staticDOMSharing='runtime-dom-factor';console.log('DOM_FACTOR_VALIDATED',trial.total_s);}
  else console.log('DOM_FACTOR_REJECTED',trial.hash);
  if(!has('--keep-mp4'))fs.rmSync(trialPath,{force:true});
 }
 if(validation.correct && enableSnapshotReplay){
  // Validate the generic snapshot/DOM-diff variant against the already known
  // reference. Do not accept it if even one final byte differs.
  const trial={...plan,domReplay:{enabled:true,snapshots:domSnapshots},
    optimizations:{...plan.optimizations,staticDOMSharing:'snapshot-replay'}};
  const probe=await render(cdp,trial,path.join(out,'dom_replay_validation.mp4'),1,plan.background.mode==='none'?1:slotCount,null,null);
  plan.domReplay.probe_s=probe.total_s;plan.domReplay.probe_hash=probe.hash;
  plan.domReplay.correct=probe.correct;
  if(probe.correct){plan.domReplay.enabled=true;plan.optimizations.staticDOMSharing='snapshot-replay';}
  if(!has('--keep-mp4'))fs.rmSync(path.join(out,'dom_replay_validation.mp4'),{force:true});
 }
 plan.compilation={analyze_s:n4((performance.now()-started)/1000-validation.total_s),validation_s:validation.total_s,
  total_s:n4((performance.now()-started)/1000)};
 if(!validation.correct)throw Error('Plan failed exact MP4 checksum '+validation.hash+' expected '+expected);
 plan.validated=true;plan.plan_digest=planDigest(plan);fs.mkdirSync(path.dirname(planPath),{recursive:true});fs.writeFileSync(planPath,JSON.stringify(plan,null,2));
 if(!has('--keep-mp4'))fs.rmSync(validationPath,{force:true});
 console.log('PLAN_SAVED',planPath,JSON.stringify({capture:plan.capture,compilation:plan.compilation,hash:validation.hash}));
 return plan;
}
// Runtime optimization: mathematical scene-property evaluation plus a small
// input-specific DOM measurement, never scanning a full timeline of pixels.
// Everything discovered is job-local; no assets or instructions are persisted.
async function inferRuntimePlan(cdp){
 const started=performance.now(),timings={};
 const sourcePath=path.join(ROOT,fixture.scene);
 let numeric;
 try{numeric=inferNumericScene(sourcePath,comp)}catch(e){
  return {safe:false,reason:e.message,analysis_s:n4((performance.now()-started)/1000),timings};
 }
 timings.numeric_s=n4((performance.now()-started)/1000);
 const full={x:0,y:0,width:comp.width,height:comp.height};
 const measureStart=performance.now();
 let tab=null;const observations=[];
 try{
  // Probe only structural phases: the initial DOM and each Sequence start.
  // Mathematical transform extrema are evaluated across the timeline without
  // paying for 120 layout or screenshot operations.
  const key=numeric.source_sha256+':'+JSON.stringify(comp);
  if(probeLifecycle==='reused'&&runtimeProbeCache.has(key))tab=runtimeProbeCache.get(key);
  else {
   tab=await tabOpen(cdp,full,1,numeric.background);
   if(probeLifecycle==='reused')runtimeProbeCache.set(key,tab);
  }
  const starts=[0,...numeric.sequenceStarts].sort((a,b)=>a-b);
  for(const frame of starts){
   await evaluate(cdp,tab.sessionId,`window.drawBatch(${frame},${comp.durationInFrames},1)`);
   const tags=numeric.elements.map(e=>e.tag);
   const got=await evaluate(cdp,tab.sessionId,`(()=>{
     const tags=${JSON.stringify(tags)};const result={};
     for(const tag of tags){
       const el=document.querySelector('#app '+tag);
       if(!el){result[tag]=null;continue;}
       const r=el.getBoundingClientRect(),c=getComputedStyle(el),parent=getComputedStyle(el.parentElement);
       result[tag]={x:r.x,y:r.y,width:r.width,height:r.height,centerX:r.x+r.width/2,
         font:c.font,opacity:c.opacity,transform:c.transform,background:c.backgroundColor,
         textShadow:c.textShadow,boxShadow:c.boxShadow,filter:c.filter,backdropFilter:c.backdropFilter,
         mixBlendMode:c.mixBlendMode,clipPath:c.clipPath,outline:c.outlineWidth,
         borderWidth:c.borderTopWidth,alignment:parent.alignItems,display:parent.display,
         naturalText:el.textContent};
     }
     return result;
   })()`);
   observations.push({frame,tags:got});
  }
  const texts={};for(const e of numeric.elements)if(e.dynamicText){
    const available=e.texts.filter(Boolean);if(available.length===0)continue;
    const all=Array.from(new Set(available));
    texts[e.tag]=await evaluate(cdp,tab.sessionId,`(()=>{
      const elem=document.querySelector('#app ${e.tag}');if(!elem)return null;
      const c=getComputedStyle(elem);const span=document.createElement('span');
      span.style.cssText='position:absolute;left:-10000px;top:0;white-space:pre;';span.style.font=c.font;
      document.body.appendChild(span);
      let max=0;for(const text of ${JSON.stringify(all)}){span.textContent=text;max=Math.max(max,span.getBoundingClientRect().width)}
      span.remove();return max;
    })()`);
  }
  // Fail closed if actual computed styles can paint beyond their DOM bounds.
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const el of numeric.elements){
    const ys=el.transformY;
    for(let phase=0;phase<starts.length;phase++){
      const f0=starts[phase],f1=phase+1<starts.length?starts[phase+1]-1:comp.durationInFrames-1;
      const obs=observations[phase].tags[el.tag];
      if(!obs)continue;
      if(obs.textShadow!=='none'||obs.boxShadow!=='none'||obs.filter!=='none'||obs.backdropFilter!=='none'||obs.mixBlendMode!=='normal'||obs.clipPath!=='none'||obs.borderWidth!=='0px')throw Error('Unsupported visual effect on '+el.tag);
      let lx=obs.x,rx=obs.x+obs.width;
      if(el.dynamicText){
        if(obs.alignment!=='center'||!['flex','inline-flex'].includes(obs.display))throw Error('Unsupported dynamic text centering for '+el.tag);
        const width=Math.max(obs.width,texts[el.tag]||0)+4;
        lx=obs.centerX-width/2;rx=obs.centerX+width/2;
      }
      const minY=Math.min(...ys.slice(f0,f1+1)),maxY=Math.max(...ys.slice(f0,f1+1));
      left=Math.min(left,lx);right=Math.max(right,rx);
      top=Math.min(top,obs.y+minY-ys[f0]);bottom=Math.max(bottom,obs.y+obs.height+maxY-ys[f0]);
    }
  }
  if(!Number.isFinite(left))throw Error('No DOM foreground bounds');
  // Rasterization halo: covers glyph antialiasing and pixel-boundary rounding.
  // This is a conservative allowance, not a proof for arbitrary CSS.
  const halo=Math.max(8,padding);
  let x=Math.max(0,Math.floor(left)-halo),y=Math.max(0,Math.floor(top)-halo);
  const x1=Math.min(comp.width,Math.ceil(right)+halo),y1=Math.min(comp.height,Math.ceil(bottom)+halo);
  let crop={x,y,width:x1-x,height:y1-y};
  // YUV420 chroma blocks require even positioning. Expand ROI conservatively
  // rather than shifting it, preserving the original scene and pixel content.
  if(filterBeforePad){
    const ax=Math.max(0,Math.floor(crop.x/2)*2),ay=Math.max(0,Math.floor(crop.y/2)*2);
    const right=Math.min(comp.width,Math.ceil((crop.x+crop.width)/2)*2);
    const bottom=Math.min(comp.height,Math.ceil((crop.y+crop.height)/2)*2);
    crop={x:ax,y:ay,width:right-ax,height:bottom-ay};
  }
  if(crop.width*crop.height>0.8*comp.width*comp.height)throw Error('No beneficial ROI');
  timings.dom_s=n4((performance.now()-measureStart)/1000);
  if(has('--debug-inference'))console.log('INFERENCE_DOM',JSON.stringify({observations,bounds:{left,top,right,bottom},text_widths:texts,crop}));
  const plan={version:2,composition:comp,capture:crop,background:{mode:'solid',color:numeric.background},
    optimizations:{staticDOMSharing:false,frameRepetition:false,elementReuse:false,layerReuse:false,visualCache:false,
      roi:true,staticBackgroundReconstruction:true},domReplay:{enabled:false},validated:false};
  return {safe:true,plan,analysis_s:n4((performance.now()-started)/1000),timings,
    assumptions:'Constrained AST numeric math + DOM geometry, no pixel scan',observations:observations.map(o=>({frame:o.frame,boxes:o.tags})),
    bounds:{left,top,right,bottom},text_max_widths:texts};
 }catch(e){return {safe:false,reason:e.message,analysis_s:n4((performance.now()-started)/1000),timings};}
 finally{if(tab&&probeLifecycle==='new')await tabClose(cdp,tab);}
}
async function sendRaw(ff,buf){if(!ff.stdin.write(buf))await once(ff.stdin,'drain')}
async function render(cdp,plan,file,tabs,slots,overrideRepetition=null,cache=tabLifecycle==='reused'?tabCache:null,overrideDomMode=null,overrideLayerMode=null){const started=performance.now();const regions=plan.packedRegions||null;const logicalCapture=plan.capture;const captureCfg=regions?{x:0,y:0,width:regions.reduce((v,r)=>v+r.width,0),height:Math.max(...regions.map(r=>r.height))}:logicalCapture;
 const repetition=overrideRepetition==='off'||(overrideRepetition===null&&repeatPolicy==='off')?false:plan.optimizations?.frameRepetition;
 const effectiveFrames=repetition?repetition.start+1:comp.durationInFrames;
 const isCropped=plan.background.mode==='solid';
 if(regions){if(!Array.isArray(regions)||regions.length<2||regions.length>4||!isCropped)throw Error('Packed regions require 2-4 regions and opaque solid background');
  for(const r of regions){for(const k of ['x','y','width','height'])if(!Number.isInteger(r[k]))throw Error('Packed region missing integer '+k);if(r.x<0||r.y<0||r.width<2||r.height<2||r.x+r.width>comp.width||r.y+r.height>comp.height||[r.x,r.y,r.width,r.height].some(n=>n%2))throw Error('Packed YUV420 regions require even aligned in-bounds rectangles');}
  if(captureCfg.width>8192||captureCfg.height>8192)throw Error('Packed atlas dimensions too large');
  if(activePackedDisallowed(plan))throw Error('Packed regions not supported with layer/visual assets or DOM snapshots');
 }const bg=isCropped?plan.background.color:'000000';
 if(filterBeforePad&& (captureCfg.x%2||captureCfg.y%2||captureCfg.width%2||captureCfg.height%2))throw Error('YUV420 pre-pad requires even crop bounds: infer or compile an aligned ROI first');
 const snap=plan.domReplay?.enabled?plan.domReplay.snapshots:null;
 const activeDomMode=overrideDomMode||domMode;
 if(plan.validated&&activeDomMode==='factor'&&plan.optimizations?.staticDOMSharing!=='runtime-dom-factor')throw Error('DOM factor strategy not approved by compiled plan');
 const activeLayerMode=overrideLayerMode||layerReuse;
 const visual=visualCacheMode==='on'?plan.optimizations?.visualCache:false;
 if(visualCacheMode==='on'&&!visual)throw Error('Visual cache not built in this plan');
 if(visual&&activeLayerMode==='plan')throw Error('Visual cache and per-job upper band cache are mutually exclusive');
 let pixels=null;if(visual){const assetPath=path.join(ROOT,'visual_cache',visual.filename);const key=visual.content_sha256;
  if(!visualAssetCache.has(key)){const loaded=fs.readFileSync(assetPath);if(sha(loaded)!==key)throw Error('Stale/corrupt visual layer asset');visualAssetCache.set(key,loaded);}
  pixels=visualAssetCache.get(key);}
 const band=activeLayerMode==='plan'?plan.optimizations?.layerReuse:false;
 if(activeLayerMode==='plan'&&!band)throw Error('Layer reuse was not validated in this plan');
 // Cached pages preserve their loaded React trees, frame pools and mapped SHM across jobs.
 // The cache key excludes repetition: it only affects FFmpeg, never Chromium state.
 // Rendering plans and scene bundles are fixed/verified for this process.
 const columns=Math.min(atlasColumns,slots);
 if(columns!==slots&&(band||visual))throw Error('Grid atlas not yet compatible with layer/video cache; choose strip layout');
 const key=JSON.stringify([captureCfg,tabs,slots,columns,bg,!!snap,activeDomMode,!!visual,regions]);
 const existing=cache?.get(key);
 function createEncoder(){
 const {width:W,height:H,fps,durationInFrames:total}=comp;
 const ec=fixture.encoder;
 const cmd=['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','bgra','-video_size',`${captureCfg.width}x${captureCfg.height}`,'-framerate',String(fps),'-i','pipe:0','-an'];
 const filters=[];
 if(isCropped&&!regions){if(filterBeforePad)filters.push('format=yuv420p');filters.push(`pad=${W}:${H}:${captureCfg.x}:${captureCfg.y}:color=0x${bg}`);}
 if(repetition)filters.push(`tpad=stop_mode=clone:stop=${repetition.clones}`);
 if(regions){
  const labels=regions.map((_,i)=>`[slice${i}]`);let x=0;
  const parts=[`[0:v]format=yuv420p,split=${regions.length}${labels.join('')}`];
  for(let i=0;i<regions.length;i++){const r=regions[i];const prev=i===0?'':`[merged${i-1}]`;
   parts.push(`${labels[i]}crop=${r.width}:${r.height}:${x}:0${i===0?`,pad=${W}:${H}:${r.x}:${r.y}:color=0x${bg}[merged0]`:`[region${i}]`}`);
   if(i>0)parts.push(`${prev}[region${i}]overlay=${r.x}:${r.y}:format=yuv420:shortest=1[merged${i}]`);
   x+=r.width;
  }
  if(repetition)parts.push(`[merged${regions.length-1}]tpad=stop_mode=clone:stop=${repetition.clones}[out]`);
  else parts.push(`[merged${regions.length-1}]null[out]`);
  cmd.push('-filter_complex',parts.join(';'),'-map','[out]');
 }else if(filters.length)cmd.push('-vf',filters.join(','));
 if(ffFilterThreads)cmd.unshift('-filter_threads',String(ffFilterThreads));
 cmd.push('-c:v',ec.codec,'-threads',String(ec.threads),'-preset',ec.preset,'-crf',String(ec.crf),'-pix_fmt',ec.pixelFormat,
  '-movflags','+hybrid_fragmented','-frag_duration',String(ec.fragmentDuration),'-flush_packets','1',file);
 const ff=spawn(process.env.MINIATOR_FFMPEG||'ffmpeg',cmd,{stdio:['pipe','ignore','pipe']});let stderr='';ff.stderr.on('data',b=>stderr+=b.toString()); return {ff,stderr:()=>stderr};
 }
 // Create the complete frame-to-atlas schedule BEFORE touching the DOM or its output.
 // Conservative immutable per-frame geometry is used only for this validated
 // source/parameter scope. Unknown parameter dependencies require full-frame fallback.
 let predictedRounds=null,predictedPlanMs=0,predictedPlanOrigin=null;
 if(predictiveAtlasEnabled){
  if(band||visual)throw Error('Predictive atlas not yet compatible with layer/visual caching');
  const tPredict=performance.now();
  const sceneHash=sha(fs.readFileSync(path.join(ROOT,fixture.scene)));
  const signature=JSON.stringify([sceneHash,comp,captureCfg,regions,tabs,slots,effectiveFrames,activeDomMode]);
  let saved=predictiveTemplateCache.get(signature);
  if(!saved){
   const rects=regions||[captureCfg];
   const complexity=sceneComplexity(fs.readFileSync(path.join(ROOT,fixture.scene),'utf8')).factor;
   const descriptors=Array.from({length:effectiveFrames},()=>({regions:rects,complexity}));
   const rectPixels=captureCfg.width*captureCfg.height;
   const maxWidth=32768,maxHeight=8192;
   const paintUnitCost=0.000002,capturePixelCost=0.000001,captureOverhead=3.5;
   const targetCost=captureOverhead+slots*(rects.reduce((s,r)=>s+r.width*r.height,0)*complexity+rects.length*8000)*paintUnitCost+
     rectPixels*slots*capturePixelCost+0.001;
   const config={maxWidth,maxHeight,maxBytes:Math.ceil(captureCfg.width*captureCfg.height*slots*4*6*1.02),
    surfaceCopies:6,maxSlots:slots,targetCost,captureOverhead,paintUnitCost,capturePixelCost};
   // Empty dependencies: pack once and reuse for every render of this immutable source.
   saved=compileTemplateAtlas({sourceHash:sceneHash,frameDescriptors:descriptors,parameterDependencies:[],config});
   predictiveTemplateCache.set(signature,saved);
  }
  const atlas=saved.planFor();
  predictedRounds=[];
  for(let i=0;i<atlas.batches.length;i+=tabs){
   predictedRounds.push(atlas.batches.slice(i,i+tabs).map(b=>({at:b.startFrame,count:b.count})));
  }
  predictedPlanMs=performance.now()-tPredict;
  predictedPlanOrigin=atlas.origin;
 }
 const poolPromise=existing?Promise.resolve(existing):Promise.all(Array.from({length:tabs},()=>tabOpen(cdp,captureCfg,slots,bg,snap,activeDomMode,columns,regions)));
 // Before tab initialization completes, optionally spawn FFmpeg. This overlaps
 // process startup with the browser setup without changing any encoded frames.
 const earlyFF=earlyEncoder?createEncoder():null;
 const pool=await poolPromise;
 if(cache&&!existing)cache.set(key,pool);
 const reused_tabs=!!existing;
 // A reusable Chromium tab may still have a reduced viewport from its previous job.
 for(const tab of pool)if(tab.layerActive&&!visual){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:tab.width,height:captureCfg.height,deviceScaleFactor:1,mobile:false},tab.sessionId);
  await evaluate(cdp,tab.sessionId,"document.getElementById('app').style.top='0px'");
  tab.height=captureCfg.height;tab.layerActive=false;tab.visualActive=false;
 }
 const setup_s=(performance.now()-started)/1000;
 const {ff,stderr:stderrFn}=earlyFF||createEncoder();
 let writes=0,waitS=0,captureS=0;const framesPerGroup=tabs*slots;
 let cachedTop=null,layerFrames=0,layerEnabled=false;
 // Keep only the per-frame changing lower region in Chromium. Reconstruct the upper band from an input-keyed asset.
 if(visual){await Promise.all(pool.filter(tab=>!tab.visualActive).map(async tab=>{
  await evaluate(cdp,tab.sessionId,`document.getElementById('app').style.top='-${visual.splitY}px'`);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:tab.width,height:captureCfg.height-visual.splitY,deviceScaleFactor:1,mobile:false},tab.sessionId);
  tab.height=captureCfg.height-visual.splitY;tab.layerActive=true;tab.visualActive=true;
 }));layerEnabled=true;}
 const layerActivation=band?Math.ceil((band.stableFrom+1)/framesPerGroup)*framesPerGroup:Infinity;
 try{
  async function makeCaptureBatch(offset,batch,roundAssignments=null){
   if(band&&!layerEnabled&&offset>=layerActivation){
    if(!cachedTop)throw Error('No stable-layer pixels captured during this render');
    await Promise.all(pool.map(async tab=>{
     await evaluate(cdp,tab.sessionId,`document.getElementById('app').style.top='-${band.splitY}px'`);
     await cdp.send('Emulation.setDeviceMetricsOverride',{width:tab.width,height:captureCfg.height-band.splitY,deviceScaleFactor:1,mobile:false},tab.sessionId);
     tab.height=captureCfg.height-band.splitY;tab.layerActive=true;
    }));layerEnabled=true;
   }
   const short=layerEnabled;
   return Promise.all(pool.map((tab,i)=>{
    const task=roundAssignments?roundAssignments[i]:{at:offset+i*slots,count:Math.min(slots,effectiveFrames-(offset+i*slots))};
    if(!task||task.at>=effectiveFrames||task.count<=0)return Promise.resolve(null);
    const {at,count}=task;
    const begin=performance.now();return capture(cdp,tab,captureCfg,at,slots,batch,m=>{
     const bufs=[];
     for(let j=0;j<count;j++)bufs.push(native.extractTileGrid(tab.shm,0,tab.width,tab.height,m.stride,j,captureCfg.width,short?captureCfg.height-(visual?visual.splitY:band.splitY):captureCfg.height,0,tab.columns));
     return {at,bufs,short};
    }).then(x=>{captureS+=(performance.now()-begin)/1000;return x});
   }));
  }
  const rounds=predictedRounds||Array.from({length:Math.ceil(effectiveFrames/framesPerGroup)},(_,i)=>null);
  let pending=makeCaptureBatch(0,0,rounds[0]);
  for(let batch=0;batch<rounds.length;batch++){
   const offset=predictedRounds?predictedRounds[batch][0].at:batch*framesPerGroup;
   const current=await pending;
   for(const next of current)if(next && band&&!cachedTop&&!next.short){
    for(let j=0;j<next.bufs.length;j++)if(next.at+j>=band.stableFrom){
     cachedTop=Buffer.from(next.bufs[j].subarray(0,band.splitY*captureCfg.width*4));break;
    }
   }
   if(pipelineMode==='on'&&batch+1<rounds.length)pending=makeCaptureBatch((batch+1)*framesPerGroup,batch+1,rounds[batch+1]);
   for(const next of current){if(!next)continue;
    for(let j=0;j<next.bufs.length;j++){let buf=next.bufs[j];
     if(next.short){const merged=Buffer.allocUnsafe(captureCfg.width*captureCfg.height*4);
      if(visual){const id=visual.maps[next.at+j];const a=id*visual.layer_bytes;pixels.copy(merged,0,a,a+visual.layer_bytes);buf.copy(merged,visual.layer_bytes);}
      else{cachedTop.copy(merged,0);buf.copy(merged,band.splitY*captureCfg.width*4);}
      buf=merged;layerFrames++;}
     const t0=performance.now();await sendRaw(ff,buf);waitS+=(performance.now()-t0)/1000;writes++;
    }
   }
   if(pipelineMode==='off'&&batch+1<rounds.length)pending=makeCaptureBatch((batch+1)*framesPerGroup,batch+1,rounds[batch+1]);
  }
  if(writes!==effectiveFrames)throw Error('Missing source frames '+writes+'/'+effectiveFrames);
  ff.stdin.end();const code=await new Promise((resolve,reject)=>{ff.once('close',resolve);ff.once('error',reject)});
  if(code!==0)throw Error('FFmpeg failed '+code+': '+stderrFn());
  const total_s=(performance.now()-started)/1000;
  const hash=sha(fs.readFileSync(file));
  return {packed_regions:regions,encoding_strategy:regions?'packed-yuv-overlay':isCropped?'compact-roi':'full-bgra',total_s:n4(total_s),setup_s:n4(setup_s),render_encode_s:n4(total_s-setup_s),write_wait_s:n4(waitS),
    capture_time_sum_s:n4(captureS),tabs,slots,columns,predictive_plan_ms:n4(predictedPlanMs),predictive_origin:predictedPlanOrigin,atlas_rounds:predictedRounds?.length??null,atlas_batch_sizes:predictedRounds?.flat().map(x=>x.count)??null,source_frames_written:writes,output_frames:comp.durationInFrames,
    repetition_applied:!!repetition,tabs_setup:existing?0:tabs,reused_tabs,tab_lifecycle:cache?'reused':'new',dom_mode:activeDomMode,layer_mode:activeLayerMode,layer_frames:layerFrames,visual_cache:!!visual,pipeline:pipelineMode,hash,correct:hash===expected};
 }finally{
   if(ff.exitCode===null)ff.kill('SIGKILL');
   if(!cache)await Promise.all(pool.map(t=>tabClose(cdp,t)));
 }
}
function activePackedDisallowed(plan){return !!(plan.domReplay?.enabled||plan.optimizations?.layerReuse||plan.optimizations?.visualCache)}
async function main(){fs.mkdirSync(out,{recursive:true});let b;
 const existingPlan=(mode==='compile'||mode==='runtime'||mode==='runtime-infer'||mode==='runtime-compare'||mode==='compiler-matrix'||mode==='planner-matrix'||mode==='chosen')?null:verifiedPlan(read(planPath));
 try{b=await launch();
  let plan=mode==='compile'?await compile(b.cdp):mode==='runtime'?{version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false},optimizations:{staticDOMSharing:false,frameRepetition:false,elementReuse:false,layerReuse:false,visualCache:false},validated:false}:existingPlan;
  if(mode==='runtime-compare'){
   const full={version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},
     domReplay:{enabled:false},optimizations:{staticDOMSharing:false,frameRepetition:false,elementReuse:false,layerReuse:false,visualCache:false},validated:false};
   const variants=opt('--compare-variants','roi_new,full_new,roi_reused,full_reused').split(',');
   for(const variant of variants)if(!['roi_new','full_new','roi_reused','full_reused','roi_reused_prepad','roi_new_prepad'].includes(variant))throw Error('Unknown comparison variant '+variant);
   const run=async(variant,index)=>{
    const st=performance.now(),useROI=variant.startsWith('roi'),reuse=variant.includes('_reused');
    filterBeforePad=variant.endsWith('_prepad');
    probeLifecycle=reuse?'reused':'new';let a={safe:false,analysis_s:0,timings:{}};
    if(useROI)a=await inferRuntimePlan(b.cdp);
    const plan=useROI&&a.safe?a.plan:full;
    const file=path.join(out,`${variant}_${index}.mp4`);
    const tabs=useROI&&a.safe?tabCount:4,slots=useROI&&a.safe?slotCount:3;
    const r=await render(b.cdp,plan,file,tabs,slots,'off',reuse?tabCache:null,'react','off');
    const total=n4((performance.now()-st)/1000);
    if(!r.correct)throw Error('Output mismatch '+variant+' '+r.hash);
    if(!has('--keep-mp4'))fs.rmSync(file,{force:true});
    return {variant,index,end_to_end_s:total,analysis_s:a.analysis_s,analysis_timings:a.timings,analysis_safe:a.safe,
      fallback_reason:a.reason||null,capture:plan.capture,...r};
   };
   const rows=[];
   for(const variant of variants){const x=await run(variant,'warmup');console.log('COMPARE_WARMUP',variant,x.end_to_end_s,x.capture);}
   for(let rep=0;rep<repetitions;rep++)for(const variant of rep%2?[...variants].reverse():variants){
    const r=await run(variant,rep);rows.push(r);
    fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(rows,null,2));
    console.log('COMPARE_RUN',variant,rep,JSON.stringify({total:r.end_to_end_s,analysis:r.analysis_s,render:r.total_s,hash:r.hash}));
   }
   const summary={scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),reference_sha256:expected,
    browser:browserVersion,method:'runtime numeric prediction + bounded DOM, no precompiled plan',repetitions,
    medians:{},runs:rows};
   for(const variant of variants){const part=rows.filter(r=>r.variant===variant);
    const measures={};for(const key of ['end_to_end_s','analysis_s','total_s','setup_s']){
      const v=part.map(r=>r[key]).sort((a,b)=>a-b);measures[key]={median:v[Math.floor(v.length/2)],all:v};
    }summary.medians[variant]=measures;
   }
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
   console.log('COMPARE_SUMMARY',JSON.stringify(summary.medians));return;
  }
  if(mode==='runtime-infer'){
   // Warm and measure actual one-off analysis plus output encoding. Every job
   // re-derives instructions, even if browser render tabs happen to be reused.
   const rows=[];
   const fallback={version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},
     background:{mode:'none'},domReplay:{enabled:false},
     optimizations:{staticDOMSharing:false,frameRepetition:false,elementReuse:false,layerReuse:false,visualCache:false},validated:false};
   const run=async(index)=>{
     const st=performance.now();const analysis=await inferRuntimePlan(b.cdp);
     const plan=analysis.safe?analysis.plan:fallback;
     const tabs=analysis.safe?tabCount:4,slots=analysis.safe?slotCount:3;
     const output=path.join(out,`runtime_inferred_${index}.mp4`);
     const result=await render(b.cdp,plan,output,tabs,slots,'off',tabLifecycle==='reused'?tabCache:null,'react','off');
     const total=n4((performance.now()-st)/1000);
     if(!result.correct)throw Error('Runtime inference output not exact: '+result.hash+' region '+JSON.stringify(plan.capture));
     if(!has('--keep-mp4'))fs.rmSync(output,{force:true});
     return {rep:index,analysis_s:analysis.analysis_s,analysis_timings:analysis.timings,
       render_s:result.total_s,end_to_end_s:total,roi_safe:analysis.safe,
       fallback_reason:analysis.reason||null,roi:plan.capture,
       bounds:analysis.bounds,text_max_widths:analysis.text_max_widths,...result};
   };
   const warm=await run('warmup');console.log('RUNTIME_INFER_WARMUP',JSON.stringify({total:warm.end_to_end_s,analysis:warm.analysis_s,region:warm.roi,safe:warm.roi_safe,reason:warm.fallback_reason}));
   for(let i=0;i<repetitions;i++){
     const r=await run(i);rows.push(r);
     fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(rows,null,2));
     console.log('RUNTIME_INFER_RUN',i,JSON.stringify({total:r.end_to_end_s,analysis:r.analysis_s,render:r.render_s,safe:r.roi_safe,region:r.roi,hash:r.hash}));
   }
   const metric=key=>{const v=rows.map(x=>x[key]).sort((a,b)=>a-b);return {median:v[Math.floor(v.length/2)],min:v[0],max:v.at(-1),values:v}};
   const summary={mode:'runtime-mathematical-analysis-per-job',scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),reference_sha256:expected,
     browser:browserVersion,tab_lifecycle:tabLifecycle,probe_lifecycle:probeLifecycle,repetitions,analysis:metric('analysis_s'),render:metric('render_s'),end_to_end:metric('end_to_end_s'),rows};
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
   console.log('RUNTIME_INFER_SUMMARY',JSON.stringify({analysis:summary.analysis,end_to_end:summary.end_to_end}));return;
  }
  if(mode==='compiler-matrix'){
   const externalPlanPath=opt('--matrix-plan',null);
   const basePlan=externalPlanPath?read(externalPlanPath):null;
   if(basePlan&&JSON.stringify(basePlan.composition)!==JSON.stringify(comp))throw Error('Matrix plan composition does not match fixture');
   const plan=basePlan?{...basePlan,validated:false,domReplay:{enabled:false},optimizations:{...basePlan.optimizations,staticDOMSharing:false,elementReuse:false,layerReuse:false,visualCache:false}}:
     {version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false},optimizations:{staticDOMSharing:false,frameRepetition:false,elementReuse:false,layerReuse:false,visualCache:false},validated:false};
   const compareRepetition=opt('--matrix-repeat','off')==='on'?null:'off';
   const styles=opt('--matrix-styles','react,staticjs,staticcss').split(',');
   if(styles.some(s=>!['react','compiledjs','compiledcss','staticjs','staticcss'].includes(s))||!styles.includes('react'))throw Error('Matrix requires supported styles and react');
   const localCache=new Map(),records=[];
   let freshReactReference=null;
   const originalSceneHash=sha(fs.readFileSync(path.join(ROOT,fixture.scene)));
   const compiledSourceName=fs.readFileSync(path.join(ROOT,'compiler_entry.js'),'utf8').match(/\.\/source\/([^']+\.tsx)/)?.[1];
   const originalCompiledSceneHash=compiledSourceName?sha(fs.readFileSync(path.join(ROOT,'source',compiledSourceName))):null;
   if(originalCompiledSceneHash!==originalSceneHash)throw Error('React and compiler scenes differ');
   const staticScene=opt('--static-scene-source',null);
   if(staticScene&&sha(fs.readFileSync(path.join(ROOT,staticScene)))!==originalSceneHash)throw Error('React and static compiler source differ');
   const run=async(style,rep,warmup=false)=>{
    if(sha(fs.readFileSync(path.join(ROOT,fixture.scene)))!==originalSceneHash)throw Error('Scene changed during matrix');
    const f=path.join(out,`${style}_${warmup?'warmup':rep}.mp4`);
    const r=await render(b.cdp,plan,f,tabCount,slotCount,compareRepetition,localCache,style,'off');
    if(style==='react'&&freshReactReference===null)freshReactReference=r.hash;
    const matchedFreshReference=r.hash===freshReactReference;
    records.push({style,rep,warmup,...r,matched_fresh_react:matchedFreshReference});
    if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
    console.log('COMPILER_RUN',style,rep,'total',r.total_s,'setup',r.setup_s,'hash',r.hash,'fresh_react_match',matchedFreshReference);
    fs.writeFileSync(path.join(out,'compiler_runs.json'),JSON.stringify(records,null,2));
    if(!matchedFreshReference)throw Error('Mismatch against fresh same-version React output in '+style+' rep '+rep);
   };
   for(const style of styles)await run(style,-1,true);
   for(let rep=0;rep<repetitions;rep++)for(const style of(rep%2?[...styles].reverse():styles))await run(style,rep,false);
   const med=x=>x.length?[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)]:null;
   const reference=freshReactReference;
   const summary={scene:fixture.scene,composition:comp,scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),browser:browserVersion,
    configurations:{tabs:tabCount,slots:slotCount,columns:atlasColumns,reps:repetitions,tab_lifecycle:'reused',encoder:fixture.encoder,external_plan:externalPlanPath,repetition:!!(compareRepetition===null&&plan.optimizations.frameRepetition),capture:plan.capture},
    historic_reference_diagnostic_only:expected,current_react_reference:reference,reference_policy:'fresh React warmup from identical scene source/build/renderer',source_hash_verified_equal:originalCompiledSceneHash===originalSceneHash,all_modes_match_current_react:records.every(x=>x.matched_fresh_react),
    median_s:Object.fromEntries(styles.map(x=>[x,med(records.filter(v=>v.style===x&&!v.warmup).map(v=>v.total_s))])),
    startup_s:Object.fromEntries(styles.map(x=>[x,records.find(v=>v.style===x&&v.warmup)?.setup_s])),runs:records};
   fs.writeFileSync(path.join(out,'compiler_summary.json'),JSON.stringify(summary,null,2));
   console.log('COMPILER_MATRIX',JSON.stringify({medians:summary.median_s,reference,exact:summary.all_modes_match_current_react}));
   return;
  }
  if(mode==='planner-matrix'){
   const confFile=opt('--planner-config',null);
   const conf=confFile?read(confFile):{};
   const inputSha=sha(fs.readFileSync(path.join(ROOT,fixture.scene)));
   const compatible=conf.source_sha256===inputSha&&JSON.stringify(conf.composition)===JSON.stringify(comp);
   const full={version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false},optimizations:{frameRepetition:false,layerReuse:false,visualCache:false},validated:false};
   const alternatives=[{name:'full-react',plan:full,dom:'react'}];
   const staticAvailable=has('--static-ready');
   if(staticAvailable)alternatives.push({name:'full-static',plan:full,dom:'staticjs'});
   if(compatible&&conf.repeat?.type==='identical-trailing-frames'){const r=conf.repeat;
    if(Number.isInteger(r.start)&&Number.isInteger(r.clones)&&r.start>=0&&r.clones>0&&r.start+r.clones===comp.durationInFrames-1){alternatives.push({name:'tail-repetition',plan:{...full,optimizations:{...full.optimizations,frameRepetition:r}},dom:'react'});}
   }
   if(compatible&&conf.background&&/^([0-9a-f]{6})$/i.test(conf.background)){
    const solid={...full,background:{mode:'solid',color:conf.background}};
    if(conf.single){const r=conf.single;
     if(['x','y','width','height'].every(k=>Number.isInteger(r[k])&&r[k]>=0)&&r.width>0&&r.height>0&&r.x+r.width<=comp.width&&r.y+r.height<=comp.height&&[r.x,r.y,r.width,r.height].every(x=>x%2===0)){
      alternatives.push({name:'single-roi',plan:{...solid,capture:r},dom:'react'});
     }
    }
    if(Array.isArray(conf.regions)&&conf.regions.length>=2){
      alternatives.push({name:'packed-regions',plan:{...solid,packedRegions:conf.regions},dom:'react'});
    }
   }
   const only=opt('--planner-only',null);const candidates=only?alternatives.filter(x=>only.split(',').includes(x.name)):alternatives;
   if(!candidates.length)throw Error('No requested planner candidates');
   const presetReference=opt('--planner-reference',null);
   if(only&&!presetReference&&!candidates.some(x=>x.name==='full-react'))throw Error('Planner-only needs a trusted reference MP4');
   const safe=(x)=>x.name==='packed-regions'?x.plan.packedRegions:null;
   const rows=[],refPath=path.join(out,'reference_full.mp4');
   let freshSha=presetReference?sha(fs.readFileSync(presetReference)):null;
   if(presetReference)fs.copyFileSync(presetReference,refPath);
   const reps=Number(opt('--reps','2'));
   if(reps<1||reps>12)throw Error('Invalid planner reps');
   const pools=new Map();
   for(const candidate of candidates){const f=path.join(out,`warm_${candidate.name}.mp4`);
    const r=await render(b.cdp,candidate.plan,f,tabCount,slotCount,candidate.name==='tail-repetition'?null:'off',pools,candidate.dom,'off');
    console.log('PLANNER_WARMUP',candidate.name,r.total_s);if(candidate.name==='full-react'){freshSha=r.hash;fs.copyFileSync(f,refPath);}
    if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
   }
   for(let rep=0;rep<reps;rep++)for(const candidate of (rep%2?[...candidates].reverse():candidates)){
     const file=path.join(out,`${candidate.name}_${rep}.mp4`);
     const r=await render(b.cdp,candidate.plan,file,tabCount,slotCount,candidate.name==='tail-repetition'?null:'off',pools,candidate.dom,'off');
     const row={name:candidate.name,rep,...r,match_full_hash:r.hash===freshSha,output:file,regions:safe(candidate)};
     rows.push(row);console.log('PLANNER_RUN',candidate.name,rep,r.total_s,'exact',row.match_full_hash);
     fs.writeFileSync(path.join(out,'planner_runs.json'),JSON.stringify(rows,null,2));
   }
   const med=a=>{a=[...a].sort((x,y)=>x-y);return a.length%2?(a[(a.length-1)/2]):(a[a.length/2-1]+a[a.length/2])/2};
   const summary={source_sha256:inputSha,configuration_compatible:compatible,reference:refPath,composition:comp,tabs:tabCount,slots:slotCount,reps,alternatives:candidates.map(x=>({name:x.name,median_s:med(rows.filter(y=>y.name===x.name).map(y=>y.total_s)),exact:rows.filter(y=>y.name===x.name).every(y=>y.match_full_hash)})),runs:rows};
   fs.writeFileSync(path.join(out,'planner_summary.json'),JSON.stringify(summary,null,2));
   console.log('PLANNER_SUMMARY',JSON.stringify(summary.alternatives));
   for(const pool of pools.values())await Promise.all(pool.map(t=>tabClose(b.cdp,t)));
   return;
  }
  if(mode==='chosen'){
   const registry=read(opt('--strategy-registry',path.join(ROOT,'strategy_registry_general.json')));
   const srcHash=sha(fs.readFileSync(path.join(ROOT,fixture.scene)));
   const propsFile=opt('--input-json',null);
   const inputs=propsFile?read(propsFile):{};
   if(Object.keys(inputs).length)throw Error('This legacy source runner does not support dynamic props; use parameterized build');
   const inputHash=sha(JSON.stringify(inputs));
   const entries=registry.choices||[];
   const record=entries.find(v=>v.source_sha256===srcHash&&v.params_sha256===inputHash&&JSON.stringify(v.composition)===JSON.stringify(comp));
   const fallback={version:2,composition:comp,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false},optimizations:{frameRepetition:false,layerReuse:false,visualCache:false},validated:false};
   let selected={name:'full-react',tabs:tabCount,slots:slotCount,dom:'react',capture:null};let job=fallback;
   if(record&&record.qa_passed===true){
    const pick=record.strategy;
    const optz={...fallback.optimizations};
    if(pick==='tail-repetition'&&record.repeat){optz.frameRepetition=record.repeat;job={...fallback,optimizations:optz};}
    else if(pick==='full-static'&&staticSource){job=fallback;}
    else if((pick==='single-roi'||pick==='packed-regions')&&record.background){
      job={...fallback,background:{mode:'solid',color:record.background},
       ...(pick==='single-roi'?{capture:record.single}:{}),
       ...(pick==='packed-regions'?{packedRegions:record.regions}:{}),
      };
    }
    if(['tail-repetition','full-static','single-roi','packed-regions','full-react'].includes(pick))selected={name:pick,tabs:record.tabs,slots:record.slots,dom:pick==='full-static'?'staticjs':'react'};
   }
   // An independently validated trailing-frame instruction can be combined with ROI.
   // Gate combined outputs against the existing source reference before promotion.
   if(opt('--combine-tail','off')==='on' && record?.qa_passed===true && record.repeat &&
      (selected.name==='single-roi'||selected.name==='packed-regions')){
     job={...job,optimizations:{...job.optimizations,frameRepetition:record.repeat}};
     selected={...selected,name:selected.name+'+tail'};
   }
   if(opt('--combine-static','off')==='on' && staticSource &&
       (selected.name.includes('roi')||selected.name.includes('packed-regions'))){
     selected={...selected,name:selected.name+'+static',dom:'staticjs'};
   }
   if(!Number.isInteger(selected.tabs)||selected.tabs<1||selected.tabs>8||!Number.isInteger(selected.slots)||selected.slots<1||selected.slots>32)throw Error('Bad selected concurrency');
   let predictedChoice=null;
   if(predictiveAtlasEnabled){
    const capture=job.packedRegions?{width:job.packedRegions.reduce((v,r)=>v+r.width,0),height:Math.max(...job.packedRegions.map(r=>r.height))}:job.capture;
    const predicted=predictCandidates({capture,regions:job.packedRegions||null,source:fs.readFileSync(path.join(ROOT,fixture.scene),'utf8'),frames:job.optimizations?.frameRepetition?.start+1||comp.durationInFrames,tabsMax:4,slotsMax:32});
    // Predict solely from source, permitted region bounds and host budget, never from captured pixels.
    const pick=predicted.candidates[0];
    predictedChoice=pick;
    if(!pick)throw Error('No safe predictive atlas candidates under memory budget');
    selected={...selected,tabs:pick.tabs,slots:pick.slots,allocation:'source-predicted',predicted_score:pick.predictedScore};
    console.log('PREDICTED_ALLOCATION',JSON.stringify({selection:selected,physical:predicted.physical,complexity:predicted.complexity,host:predicted.host,proposals:predicted.candidates}));
   }
   // Optional current-host calibration. This is previously validated timing metadata
   // keyed to source, input, composition and strategy, never pixels from this render.
   const calibrationFile=opt('--allocation-calibration',null);
   if(predictiveAtlasEnabled&&calibrationFile){
    const calibration=read(calibrationFile);
    const cpuMax=fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim();
    const memoryMax=fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();
    if(calibration.cpu_max===cpuMax&&calibration.memory_max===memoryMax){
     const calibrated=(calibration.choices||[]).find(r=>r.source_sha256===srcHash&&r.params_sha256===inputHash&&
      JSON.stringify(r.composition)===JSON.stringify(comp)&&r.capture_strategy===record?.strategy&&r.qa_passed===true);
     if(calibrated){
      const picked=calibrated.selected;
      if(!Number.isInteger(picked.tabs)||picked.tabs<1||picked.tabs>8||
         !Number.isInteger(picked.slots)||picked.slots<1||picked.slots>32)throw Error('Invalid calibrated atlas choice');
      if(picked.name.includes('+tail')){
       if(!record?.repeat)throw Error('Calibrated repetition lacks validated instruction');
       job={...job,optimizations:{...job.optimizations,frameRepetition:record.repeat}};
      }
      if(picked.name.includes('+static')&&!staticSource)throw Error('Calibrated static bundle missing');
      selected={...picked,allocation:'source-predicted+host-calibrated',calibration_runs:calibrated.samples};
      console.log('CALIBRATED_ALLOCATION',JSON.stringify({selection:selected,baseline:record?.strategy,model_chosen:predictedChoice}));
     }
    }
   }
   atlasColumns=selected.slots;
   const measured=[];
   const total=Number(opt('--reps','2'));
   if(!Number.isInteger(total)||total<1||total>10)throw Error('Invalid chosen repetitions');
   for(let rep=-1;rep<total;rep++){
    const f=path.join(out,rep<0?'warmup_chosen.mp4':`chosen_${rep}.mp4`);
    const result=await render(b.cdp,job,f,selected.tabs,selected.slots,(selected.name==='tail-repetition'||selected.name.includes('+tail'))?null:'off',tabCache,selected.dom,'off');
    if(rep>=0)measured.push({rep,...result,video:f});
    console.log(rep<0?'CHOSEN_WARMUP':'CHOSEN_RUN',JSON.stringify({rep,selection:selected.name,tabs:selected.tabs,slots:selected.slots,total_s:result.total_s,hash:result.hash}));
   }
   const times=measured.map(x=>x.total_s).sort((a,b)=>a-b),median=times.length%2?times[(times.length-1)/2]:(times[times.length/2-1]+times[times.length/2])/2;
   const summary={source_sha256:srcHash,params_sha256:inputHash,selected,registry_match:!!record,fallback:!record,median_s:median,runs:measured};
   fs.writeFileSync(path.join(out,'chosen_summary.json'),JSON.stringify(summary,null,2));
   console.log('CHOSEN',JSON.stringify({selected,registry_match:!!record,median_s:median}));
   return;
  }
  if(mode==='compile')return;
  // A true no-RenderPlan path, suitable for single-use/unpredictable scenes.
  // Browser process is kept warm, each measured job creates fresh pages.
  // This mode must work even if --plan refers to a nonexistent file.
  if(mode==='runtime'){
   if(visualCacheMode!=='off'||layerReuse!=='off'||!['react','factor','factorcss','compiledjs','compiledcss','staticjs','staticcss'].includes(domMode)||repeatPolicy==='plan'){
    // --repetition defaults to plan but this temporary runtime config has no repetition instruction.
    if(visualCacheMode!=='off'||layerReuse!=='off'||!['react','factor','factorcss','compiledjs','compiledcss','staticjs','staticcss'].includes(domMode))throw Error('No precompiled assets/scene-dependent strategies in runtime mode');
   }
   const f=path.join(out,'warmup_runtime.mp4');const warm=await render(b.cdp,plan,f,tabCount,slotCount,'off',null,domMode,'off');
   if(!warm.correct&&!has('--allow-inexact-benchmark'))throw Error('Runtime warm-up hash mismatch');if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
   console.log('RUNTIME_WARMUP',warm.total_s);
   const rows=[];for(let j=0;j<repetitions;j++){
    const file=path.join(out,`runtime_${j}.mp4`);
    const r=await render(b.cdp,plan,file,tabCount,slotCount,'off',null,domMode,'off');
    if(!r.correct&&!has('--allow-inexact-benchmark'))throw Error('Runtime hash mismatch '+r.hash);
    rows.push({rep:j,...r});console.log('RUNTIME_RUN',j,r.total_s,r.hash);
    fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(rows,null,2));
    if(!has('--keep-mp4'))fs.rmSync(file,{force:true});
   }
   const times=rows.map(x=>x.total_s).sort((a,b)=>a-b);
   const summary={mode:'runtime_without_any_precompiled_plan',chromium:browserVersion,scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),
    tabs:tabCount,slots:slotCount,columns:atlasColumns,pipeline:pipelineMode,reference:expected,allow_inexact:has('--allow-inexact-benchmark'),exact_runs:rows.filter(r=>r.correct).length,all_s:times,median_s:times[Math.floor(times.length/2)],runs:rows};
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log('RUNTIME_SUMMARY',JSON.stringify({median_s:summary.median_s,all_s:times}));return;
  }
  if(mode==='matrix'){
   const variants=opt('--variants','instructions_react,instructions_layer,visual_react').split(',');
   const all={
    runtime_1slot:{full:true,tabs:1,slots:1,cols:1,cache:false},
    runtime_2slot:{full:true,tabs:1,slots:2,cols:2,cache:false},
    runtime_4slot:{full:true,tabs:1,slots:4,cols:4,cache:false},
    runtime_8slot:{full:true,tabs:1,slots:8,cols:8,cache:false},
    runtime_2tabs2:{full:true,tabs:2,slots:2,cols:2,cache:false},
    runtime_2tabs4:{full:true,tabs:2,slots:4,cols:4,cache:false},
    runtime_4tabs1:{full:true,tabs:4,slots:1,cols:1,cache:false},
    runtime_4tabs2:{full:true,tabs:4,slots:2,cols:2,cache:false},
    runtime_4tabs3:{full:true,tabs:4,slots:3,cols:3,cache:false},
    runtime_4tabs3_pipeline:{full:true,tabs:4,slots:3,cols:3,cache:false,pipeline:'on'},
    runtime_4tabs2_pipeline:{full:true,tabs:4,slots:2,cols:2,cache:false,pipeline:'on'},
    runtime_3tabs4_pipeline:{full:true,tabs:3,slots:4,cols:4,cache:false,pipeline:'on'},
    runtime_4tabs4:{full:true,tabs:4,slots:4,cols:4,cache:false},
    runtime_3tabs4:{full:true,tabs:3,slots:4,cols:4,cache:false},
    runtime_2tabs6:{full:true,tabs:2,slots:6,cols:6,cache:false},
    instructions_react:{tabs:1,slots:12},
    instructions_no_repeat:{tabs:1,slots:12,noRepeat:true},
    instructions_factor:{tabs:1,slots:12,dom:'factor'},
    instructions_layer:{tabs:1,slots:12,layer:'plan'},
    instructions_factor_layer:{tabs:1,slots:12,dom:'factor',layer:'plan'},
    instructions_pipeline:{tabs:1,slots:12,pipeline:'on'},
    instructions_grid3:{tabs:1,slots:12,cols:3},
    instructions_grid2:{tabs:1,slots:12,cols:2},
    instructions_grid3_factor:{tabs:1,slots:12,cols:3,dom:'factor'},
    instructions_prepad:{tabs:1,slots:12,prepad:true},
    instructions_prepad_pipeline:{tabs:1,slots:12,prepad:true,pipeline:'on'},
    instructions_prepad_grid3:{tabs:1,slots:12,cols:3,prepad:true},
    instructions_prepad_grid4:{tabs:1,slots:12,cols:4,prepad:true},
    instructions_prepad_factor:{tabs:1,slots:12,prepad:true,dom:'factor'},
    instructions_prepad_layer:{tabs:1,slots:12,prepad:true,layer:'plan'},
    instructions_prepad_factor_layer:{tabs:1,slots:12,prepad:true,dom:'factor',layer:'plan'},
    instructions_prepad_grid3_pipeline:{tabs:1,slots:12,cols:3,prepad:true,pipeline:'on'},
    instructions_prepad_grid3_factor:{tabs:1,slots:12,cols:3,prepad:true,dom:'factor'},
    instructions_prepad_2tabs:{tabs:2,slots:6,prepad:true},
    instructions_prepad_4tabs:{tabs:4,slots:4,prepad:true},
    instructions_prepad_4tabs_pipeline:{tabs:4,slots:4,prepad:true,pipeline:'on'},
    instructions_prepad_4tabs_factor:{tabs:4,slots:4,prepad:true,dom:'factor'},
    instructions_prepad_4tabs_layer:{tabs:4,slots:4,prepad:true,layer:'plan'},
    instructions_prepad_4tabs_factor_layer:{tabs:4,slots:4,prepad:true,dom:'factor',layer:'plan'},
    instructions_prepad_3tabs4:{tabs:3,slots:4,prepad:true},
    instructions_prepad_4tabs2:{tabs:4,slots:2,prepad:true},
    instructions_prepad_4tabs3:{tabs:4,slots:3,prepad:true},
    instructions_prepad_4tabs6:{tabs:4,slots:6,prepad:true},
    instructions_prepad_4tabs8:{tabs:4,slots:8,prepad:true},
    instructions_prepad_4tabs12:{tabs:4,slots:12,prepad:true},
    instructions_prepad_4tabs12_pipeline:{tabs:4,slots:12,prepad:true,pipeline:'on'},
    instructions_prepad_4tabs16:{tabs:4,slots:16,prepad:true},
    instructions_prepad_4tabs16_pipeline:{tabs:4,slots:16,prepad:true,pipeline:'on'},
    best_combined:{tabs:4,slots:16,prepad:true,pipeline:'on'},
    strategy_react:{tabs:4,slots:16,prepad:true,pipeline:'on'},
    strategy_direct:{tabs:4,slots:16,prepad:true,pipeline:'on',dom:'direct'},
    strategy_css:{tabs:4,slots:16,prepad:true,pipeline:'on',dom:'css'},
    strategy_factor:{tabs:4,slots:16,prepad:true,pipeline:'on',dom:'factor'},
    strategy_factorcss:{tabs:4,slots:16,prepad:true,pipeline:'on',dom:'factorcss'},
    best_combined_newtabs:{tabs:4,slots:16,prepad:true,pipeline:'on',cache:false},
    best_grid4:{tabs:4,slots:16,cols:4,prepad:true,pipeline:'on'},
    best_grid8:{tabs:4,slots:16,cols:8,prepad:true,pipeline:'on'},
    best_grid2:{tabs:4,slots:16,cols:2,prepad:true,pipeline:'on'},
    instructions_prepad_3tabs12:{tabs:3,slots:12,prepad:true},
    instructions_prepad_2tabs16:{tabs:2,slots:16,prepad:true},
    instructions_prepad_4tabs12_factor:{tabs:4,slots:12,prepad:true,dom:'factor'},
    instructions_prepad_4tabs12_layer:{tabs:4,slots:12,prepad:true,layer:'plan'},
    instructions_prepad_3tabs8:{tabs:3,slots:8,prepad:true},
    instructions_prepad_2tabs12:{tabs:2,slots:12,prepad:true},
    instructions_prepad_1tab24:{tabs:1,slots:24,prepad:true},
    instructions_prepad_4tabs6_pipeline:{tabs:4,slots:6,prepad:true,pipeline:'on'},
    instructions_prepad_4tabs6_factor:{tabs:4,slots:6,prepad:true,dom:'factor'},
    instructions_prepad_4tabs6_layer:{tabs:4,slots:6,prepad:true,layer:'plan'},
    instructions_prepad_1tab16:{tabs:1,slots:16,prepad:true},
    instructions_prepad_2tabs_pipeline:{tabs:2,slots:6,prepad:true,pipeline:'on'},
    instructions_1x8:{tabs:1,slots:8},
    instructions_1x16:{tabs:1,slots:16},
    instructions_1x24:{tabs:1,slots:24},
    instructions_factor_pipeline:{tabs:1,slots:12,dom:'factor',pipeline:'on'},
    instructions_layer_pipeline:{tabs:1,slots:12,layer:'plan',pipeline:'on'},
    instructions_factor_layer_pipeline:{tabs:1,slots:12,dom:'factor',layer:'plan',pipeline:'on'},
    instructions_grid4:{tabs:1,slots:12,cols:4},
    instructions_grid6:{tabs:1,slots:12,cols:6},
    instructions_2tabs:{tabs:2,slots:6,cols:6},
    instructions_4tabs:{tabs:4,slots:4,cols:4},
    visual_react:{tabs:1,slots:12,visual:true},
    visual_factor:{tabs:1,slots:12,visual:true,dom:'factor'},
    visual_1x8:{tabs:1,slots:8,visual:true},
    visual_1x16:{tabs:1,slots:16,visual:true},
    visual_factor_pipeline:{tabs:1,slots:12,visual:true,dom:'factor',pipeline:'on'},
    visual_2tabs_pipeline:{tabs:2,slots:6,visual:true,pipeline:'on'},
    visual_2tabs_factor:{tabs:2,slots:6,visual:true,dom:'factor'},
    visual_4tabs_factor:{tabs:4,slots:4,visual:true,dom:'factor'},
    visual_pipeline:{tabs:1,slots:12,visual:true,pipeline:'on'},
    visual_2tabs:{tabs:2,slots:6,visual:true},
    visual_4tabs:{tabs:4,slots:4,visual:true},
    visual_no_repeat:{tabs:1,slots:12,visual:true,noRepeat:true}
   };
   for(const v of variants)if(!all[v])throw Error('Unknown matrix variant '+v);
   const full={...plan,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false},optimizations:{...plan.optimizations,frameRepetition:false,layerReuse:false,visualCache:false}};
   const original={pipeline:pipelineMode,columns:atlasColumns,visual:visualCacheMode,prepad:filterBeforePad};
   const run=async(v,file)=>{
    const x=all[v];pipelineMode=x.pipeline||'off';atlasColumns=x.cols||x.slots;visualCacheMode=x.visual?'on':'off';filterBeforePad=x.prepad||false;
    const r=await render(b.cdp,x.full?full:plan,file,x.tabs,x.slots,x.noRepeat?'off':null,x.cache===false?null:tabCache,x.dom||'react',x.layer||'off');
    return {...r,category:x.full?'runtime':x.visual?'precompiled_visual':'precompiled_instructions'};
   };
   try{
    const rows=[];
    for(const v of variants){let f=path.join(out,`warmup_${v}.mp4`);
     const r=await run(v,f);if(!r.correct)throw Error('Warmup failed '+v+' '+r.hash);
     console.log('WARMUP',v,r.total_s,r.setup_s);if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
    }
    for(let rep=0;rep<repetitions;rep++)for(const v of rep%2?[...variants].reverse():variants){
     const f=path.join(out,`${v}_${rep}.mp4`);const r=await run(v,f);
     rows.push({variant:v,repetition:rep,...r});fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(rows,null,2));
     console.log('RUN',v,rep,r.total_s,'setup',r.setup_s,'capture_sum',r.capture_time_sum_s,'hash',r.correct);
     if(!r.correct)throw Error('Hash mismatch '+v+' '+r.hash);
     if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
    }
    const summary={run_at:new Date().toISOString(),scene:fixture.scene,scene_sha256:sha(fs.readFileSync(path.join(ROOT,fixture.scene))),reference:expected,
      renderer:sha(fs.readFileSync(__filename)),chrome:browserVersion,plan_compile:plan.compilation,visual_cache:plan.optimizations.visualCache,
      variants,measurements:rows,summary:{}};
    for(const v of variants){const a=rows.filter(x=>x.variant===v).map(x=>x.total_s).sort((a,b)=>a-b);const setups=rows.filter(x=>x.variant===v).map(x=>x.setup_s).sort((a,b)=>a-b);summary.summary[v]={median_s:a[Math.floor(a.length/2)],min_s:a[0],max_s:a.at(-1),median_setup_s:setups[Math.floor(setups.length/2)],all_s:a};}
    fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log('SUMMARY',JSON.stringify(summary.summary));
   }finally{pipelineMode=original.pipeline;atlasColumns=original.columns;visualCacheMode=original.visual;filterBeforePad=original.prepad;}
   return;
  }
  if(mode==='tabcompare'){
   const configs=opt('--configs','1x12,2x6,4x4').split(',').map(s=>{
     const m=/^(\d+)x(\d+)$/.exec(s.trim());if(!m)throw Error('Invalid config '+s);
     return {label:s.trim(),tabs:Number(m[1]),slots:Number(m[2])};
   });
   const modes=['reused','new'];const rows=[];
   for(const c of configs){
     for(const lifecycle of modes){
       const f=path.join(out,`warmup_${c.label}_${lifecycle}.mp4`);
       const r=await render(b.cdp,plan,f,c.tabs,c.slots,null,lifecycle==='reused'?tabCache:null);
       if(!r.correct)throw Error('Warmup hash mismatch '+c.label+' '+lifecycle);
       if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
       console.log('WARMUP',c.label,lifecycle,r.total_s);
     }
   }
   for(let rep=0;rep<repetitions;rep++){
     const order=rep%2?[...modes].reverse():modes;
     for(const c of rep%2?[...configs].reverse():configs){
       for(const lifecycle of order){
         const f=path.join(out,`tabcompare_${c.label}_${lifecycle}_${rep}.mp4`);
         const r=await render(b.cdp,plan,f,c.tabs,c.slots,null,lifecycle==='reused'?tabCache:null);
         rows.push({config:c.label,lifecycle,repetition:rep,...r});
         fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(rows,null,2));
         console.log('RUN',c.label,lifecycle,rep,r.total_s,'setup',r.setup_s,'hash',r.correct);
         if(!r.correct)throw Error('Hash mismatch '+c.label+' '+lifecycle);
         if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
       }
     }
   }
   const summary={chromium:browserVersion,reference_sha256:expected,scene:fixture.scene,
     compiled_plan_sha256:sha(fs.readFileSync(planPath)),repetition:repeatPolicy,
     mode:'tabcompare',reps:repetitions,runs:rows,summary:{}};
   for(const c of configs)for(const lifecycle of modes){
     const entries=rows.filter(r=>r.config===c.label&&r.lifecycle===lifecycle);
     const durations=entries.map(r=>r.total_s).sort((a,b)=>a-b);
     const setup=entries.map(r=>r.setup_s).sort((a,b)=>a-b);
     summary.summary[`${c.label}_${lifecycle}`]={median_s:durations[Math.floor(durations.length/2)],
       min_s:durations[0],max_s:durations.at(-1),median_setup_s:setup[Math.floor(setup.length/2)],all_s:durations};
   }
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
   console.log('SUMMARY',JSON.stringify(summary.summary));return;
  }
  if(mode==='sweep'){
   if(plan.domReplay?.enabled || plan.domReplay?.snapshots?.length)throw Error('Sweep requires live scene evaluation, not cached DOM states');
   const configs=opt('--configs','1x8,1x12,1x16,2x6,4x4').split(',').map(s=>{
    const m=/^(\d+)x(\d+)$/.exec(s.trim());if(!m)throw Error('Invalid config '+s);
    const t=Number(m[1]),sl=Number(m[2]);sanityInt(t,'tabs',8);sanityInt(sl,'slots',32);
    return {label:`${t}x${sl}`,tabs:t,slots:sl};
   });
   const measurements=[];
   for(const c of configs){const f=path.join(out,`warmup_${c.label}.mp4`);
    const r=await render(b.cdp,plan,f,c.tabs,c.slots);
    if(!r.correct)throw Error('Warmup hash mismatch '+c.label);
    if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
    console.log('WARMUP',c.label,r.total_s);
   }
   for(let rep=0;rep<repetitions;rep++)for(const c of rep%2?[...configs].reverse():configs){
    const f=path.join(out,`${c.label}_${rep}.mp4`);
    const r=await render(b.cdp,plan,f,c.tabs,c.slots);
    measurements.push({variant:c.label,repetition:rep,...r});
    fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(measurements,null,2));
    console.log('RUN',c.label,rep,r.total_s,'correct',r.correct);
    if(!r.correct)throw Error('Output SHA mismatch '+c.label+' '+r.hash);
    if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
   }
   const summary={scene:fixture.scene,reference_sha256:expected,plan_sha256:sha(fs.readFileSync(planPath)),
    compile_total_s:plan.compilation?.total_s,chromium:browserVersion,mode:'live-react',tab_lifecycle:tabLifecycle,
    measurements,summary:{}};
   for(const c of configs){const timings=measurements.filter(r=>r.variant===c.label).map(r=>r.total_s).sort((a,b)=>a-b);
    const med=timings[Math.floor(timings.length/2)];
    summary.summary[c.label]={median_s:med,min_s:timings[0],max_s:timings.at(-1),all_s:timings};
   }
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
   console.log('SUMMARY',JSON.stringify(summary.summary));return;
  }
  const variants=opt('--variants','optimized').split(',').map(s=>s.trim());
  for(const v of variants)if(!['optimized','react','full','optimizedNoRepeat','factor','layer','factorLayer'].includes(v))throw Error('Unknown variant '+v);
  const full={...plan,capture:{x:0,y:0,width:comp.width,height:comp.height},background:{mode:'none'},domReplay:{enabled:false}};
  const react={...plan,domReplay:{enabled:false}};
  const measurements=[];
  if(!has('--no-warmup')){for(const v of variants){const f=path.join(out,'warmup_'+v+'.mp4');const r=await render(b.cdp,v==='optimized'||v==='optimizedNoRepeat'||v==='factor'||v==='layer'||v==='factorLayer'?plan:v==='react'?react:full,f,v==='full'?1:tabCount,v==='full'?1:slotCount,v==='optimizedNoRepeat'?'off':null,undefined,v==='factor'||v==='factorLayer'?'factor':'react',v==='layer'||v==='factorLayer'?'plan':'off');if(!r.correct)throw Error('Warmup hash mismatch '+v);if(!has('--keep-mp4'))fs.rmSync(f,{force:true});}}
  for(let rep=0;rep<repetitions;rep++)for(const v of rep%2?[...variants].reverse():variants){
   const f=path.join(out,`${v}_${rep}.mp4`);
   const r=await render(b.cdp,v==='optimized'||v==='optimizedNoRepeat'||v==='factor'||v==='layer'||v==='factorLayer'?plan:v==='react'?react:full,f,v==='full'?1:tabCount,v==='full'?1:slotCount,v==='optimizedNoRepeat'?'off':null,undefined,v==='factor'||v==='factorLayer'?'factor':'react',v==='layer'||v==='factorLayer'?'plan':'off');
   measurements.push({variant:v,repetition:rep,...r});fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(measurements,null,2));
   console.log('RUN',v,rep,r.total_s,'correct',r.correct);
   if(!r.correct)throw Error('Output SHA mismatch '+v+' '+r.hash);
   if(!has('--keep-mp4'))fs.rmSync(f,{force:true});
  }
  const summary={scene:fixture.scene,reference_sha256:expected,plan_sha256:sha(fs.readFileSync(planPath)),
   compile_total_s:plan.compilation?.total_s,chromium:browserVersion,tab_lifecycle:tabLifecycle,measurements,summary:{}};
  for(const v of variants){const timings=measurements.filter(r=>r.variant===v).map(r=>r.total_s).sort((a,b)=>a-b);
   summary.summary[v]={median_s:timings[Math.floor(timings.length/2)],min_s:timings[0],max_s:timings.at(-1)};}
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
  console.log('SUMMARY',JSON.stringify(summary.summary));
 }finally{
   if(b){for(const pool of tabCache.values())await Promise.all(pool.map(t=>tabClose(b.cdp,t)));
    for(const probe of runtimeProbeCache.values())await tabClose(b.cdp,probe);}
   tabCache.clear();
   await stop(b);
 }
}
main().catch(e=>{console.error('FAIL',e.stack||e);process.exitCode=1});
