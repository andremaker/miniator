'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {spawnSync}=require('node:child_process');
const available=!!process.env.CEF_ROOT && !!process.env.DISPLAY &&
 fs.existsSync(path.join(process.env.CEF_ROOT||'','Release','miniator_cef_bridge')) &&
 fs.existsSync(path.join(__dirname,'../../engine/atlas_native.node'));

test('real CEF Miniator renderer produces a complete 16-frame MP4 without browser npm dependencies',
 {skip:available?false:'Requires the external CEF SDK and native addon',timeout:120000},async()=>{
 const ws=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-cef-render-'));
 try {
  const pre=path.join(ws,'precompiled'),src=path.join(ws,'source');
  fs.mkdirSync(pre);fs.mkdirSync(src);
  fs.writeFileSync(path.join(src,'scene.js'),'// Deterministic synthetic scene for the native render pipeline.\n');
  fs.writeFileSync(path.join(src,'entry_dom.js'),'void 0;');
  const script=`(() => {const conf=window.__MINIATOR_PLAN__;const root=document.getElementById('app');const {slots,columns}=conf.execution;
   const {width,height}=conf.capture;const blocks=[];
   for(let i=0;i<slots;i++){const el=document.createElement('div');el.style.cssText='position:absolute;width:'+width+'px;height:'+height+'px;left:'+(i%columns*width)+'px;top:'+(Math.floor(i/columns)*height)+'px';root.append(el);blocks.push(el)}
   window.drawBatch=(start,total,count)=>{if(count!==slots)throw Error('Invalid batch');return blocks.map((el,i)=>{const f=Math.min(start+i,total-1);el.style.backgroundColor='rgb('+(20+f*10)+',0,0)';return f})};
   window.miniatorAtlasReady=()=>true;})();`;
  fs.writeFileSync(path.join(pre,'entry_plan.js'),script);
  for(const file of ['entry_factor','entry_factor_css','entry_direct','entry_packed'])fs.writeFileSync(path.join(pre,file+'.js'),'void 0;');
  const fixture={scene:'source/scene.js',adapter:'source/scene.js',source_sha256:'test',
   composition:{width:128,height:64,fps:24,durationInFrames:16},
   encoder:{codec:'libx264',preset:'ultrafast',crf:23,threads:2,pixelFormat:'yuv420p',fragmentDuration:1000000},
   reference_mp4_sha256:null};
  fs.writeFileSync(path.join(ws,'scene_fixture.json'),JSON.stringify(fixture));
  fs.writeFileSync(path.join(ws,'bundle_manifest.json'),JSON.stringify({format:1,sources:{}}));
  const out=path.join(ws,'out'),video=path.join(ws,'video.mp4');
  const child=spawn(process.execPath,[path.join(__dirname,'../../engine/plan_renderer.js'),
   '--mode','external','--output',out,'--video',video,'--tabs','2','--slots','4'],
   {env:{...process.env,MINIATOR_WORKSPACE:ws},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const [code]=await once(child,'close');
  assert.equal(code,0,stderr.slice(-2500)+'\n'+stdout.slice(-2500));
  const report=JSON.parse(fs.readFileSync(path.join(out,'render_summary.json')));
  assert.equal(report.output_frames,16);
  assert.equal(report.source_frames_written,16);
  assert.equal(report.reference_verified,false);
  assert.equal(report.encoding_strategy,'full-bgra');
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  assert.equal(Number(probe.stdout.trim()),16);
 } finally { fs.rmSync(ws,{recursive:true,force:true}); }
});
