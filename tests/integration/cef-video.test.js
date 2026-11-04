'use strict';
const fs=require('node:fs'),{spawn}=require('node:child_process');
const {once}=require('node:events');
const cef=require('../../cef/transport');
const native=require('../../engine/atlas_native.node');
const os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const test=require('node:test');
const output=path.join(os.tmpdir(),'miniator-cef-video-'+process.pid+'.mp4');
const width=128,height=64,cols=2,rows=2,slots=cols*rows,tabs=4,frames=48,fps=24;
const main=async()=>{
 const b=await cef.launch();let tablist=[],ff;
 try{
  const setup=async()=>{
   const target=await b.cdp.send('Target.createTarget',{width:width*cols+1,height:height*rows,url:'about:blank'});
   const attached=await b.cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
   const t={...target,...attached,width:width*cols+1,height:height*rows,nonce:0};
   tablist.push(t);
   await b.cdp.send('Page.enable',{},t.sessionId);
   const tree=await b.cdp.send('Page.getFrameTree',{},t.sessionId);
   await b.cdp.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html><html><head><style>html,body{margin:0}#app{display:grid;grid-template-columns:128px 128px;grid-template-rows:64px 64px}.tile{width:128px;height:64px}</style></head><body><div id="app"><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div></div><div id="marker" style="position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647"></div></body></html>'},t.sessionId);
   const fn=`window.drawBatch=(start,total,slots)=>{const xs=[...document.querySelectorAll('.tile')];xs.forEach((node,i)=>{const k=Math.min(start+i,total-1);node.style.backgroundColor='rgb('+(20+(k%10)*20)+',0,0)'});return Array.from({length:slots},(_,i)=>Math.min(start+i,total-1))};`;
   await b.cdp.send('Runtime.evaluate',{expression:fn},t.sessionId);
   const fp=await b.cdp.send('Page.miniatorCreateFramePool',{slotCount:2,slotCapacity:t.width*t.height*4+64,preferredBackend:'posix-shm'},t.sessionId);
   t.pool=native.openPool(fp.sharedMemoryName,fp.slotCapacity,fp.slotCount);
   return t;
  };
  const warm=await Promise.all(Array.from({length:tabs},setup));
  ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','bgra','-video_size',width+'x'+height,'-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',output],{stdio:['pipe','ignore','pipe']});
  let stderr='';ff.stderr.on('data',b=>stderr+=b.toString());
  for(let start=0;start<frames;start+=slots*tabs){
   const done=await Promise.all(warm.map(async(t,i)=>{
    const s=start+i*slots;if(s>=frames)return null;
    const evalRes=await b.cdp.send('Runtime.evaluate',{expression:`window.drawBatch(${s},${frames},${slots})`,returnByValue:true},t.sessionId);
    if(evalRes.exceptionDetails)throw Error('Timeline evaluation: '+JSON.stringify(evalRes.exceptionDetails));
    const marker=++t.nonce;await b.cdp.send('Runtime.evaluate',{expression:`document.getElementById('marker').style.backgroundColor='#${[marker&255,(marker>>>8)&255,(marker>>>16)&255].map(n=>n.toString(16).padStart(2,'0')).join('')}'`},t.sessionId);
    const shot=await b.cdp.send('Page.captureScreenshot',{miniatorFrameSlot:0,miniatorFrameId:'fr'+s,miniatorExpectedMarker:marker},t.sessionId);
    const pics=[];
    for(let idx=0;idx<slots;idx++){
     const pixels=native.extractTileGrid(t.pool,0,t.width,t.height,shot.miniatorFrame.stride,idx,width,height,0,cols); // verify addon API
     pics.push(pixels);
    }
    await b.cdp.send('Page.miniatorReleaseFrame',{slot:0,frameId:'fr'+s},t.sessionId);
    return {s,pics};
   }));
   for(const group of done.filter(Boolean))for(let j=0;j<slots;j++){
    const expected=20+((group.s+j)%10)*20;
    const pix=group.pics[j];
    if(pix.length!==width*height*4)throw Error('Wrong tile size');
    if(pix[0]!==0||pix[1]!==0||Math.abs(pix[2]-expected)>0||pix[3]!==255)throw Error('Stale/damaged frame '+(group.s+j)+' actual '+[...pix.subarray(0,4)]+' expected R='+expected);
    if(!ff.stdin.write(pix))await once(ff.stdin,'drain');
   }
  }
  ff.stdin.end();const [code]=await once(ff,'exit');if(code!==0)throw Error('ffmpeg exit '+code+' '+stderr);
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'});
  if(probe.status!==0||Number(probe.stdout.trim())!==frames)throw Error('Decoded frame count mismatch '+probe.stderr);
  console.log('PASS',JSON.stringify({frames,tabs,slots,fps}));
 }finally{
  if(ff&&ff.exitCode===null)ff.kill();
  for(const t of tablist){if(t.pool)native.closePool(t.pool);await b.cdp.send('Page.miniatorDestroyFramePool',{},t.sessionId).catch(()=>{});await b.cdp.send('Target.closeTarget',{targetId:t.targetId}).catch(()=>{});}
  await cef.stop(b);fs.rmSync(output,{force:true});
 }
};
const present=!!process.env.CEF_ROOT && !!process.env.DISPLAY && fs.existsSync(require('node:path').join(process.env.CEF_ROOT||'','Release','miniator_cef_bridge')) && fs.existsSync(require('node:path').join(__dirname,'../../engine/atlas_native.node'));
test('CEF correlated 4-tab atlas BGRA frames stream to FFmpeg', {skip:present?false:'Requires CEF_ROOT, compiled native bridge, DISPLAY and addon',timeout:120000},main);
