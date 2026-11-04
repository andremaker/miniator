const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawnSync}=require('node:child_process');
test('offline frame count and SSIM self-comparison',()=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-fidelity-'));
 try{
  const video=path.join(work,'synthetic.mp4');
  const ff=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=128x64:rate=24','-frames:v','12','-c:v','libx264','-pix_fmt','yuv420p',video],{encoding:'utf8',timeout:30000});
  assert.equal(ff.status,0,ff.stderr);
  const r=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/fidelity.js'),video,video,'1'],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).frames,12);
 }finally{fs.rmSync(work,{recursive:true,force:true});}
});
