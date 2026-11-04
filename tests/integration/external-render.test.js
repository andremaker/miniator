'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compileComposition}=require('../../src');
test('external composition renders two different prop values with correct frames',
 {skip:!(process.env.CEF_ROOT && process.env.DISPLAY && (()=>{try{require.resolve('esbuild');require.resolve('react');return true}catch{return false}})())},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-external-smoke-'));
 const template=await compileComposition({source:path.resolve(__dirname,'../../examples/animated-title.tsx'),
  width:320,height:180,fps:30,durationInFrames:12});
 try{
  const a=await template.render({output:path.join(dir,'a.mp4'),props:{title:'A'},tabs:2,slots:4});
  const b=await template.render({output:path.join(dir,'b.mp4'),props:{title:'B'},tabs:2,slots:4});
  assert.notEqual(a.hash,b.hash);
  for(const file of ['a.mp4','b.mp4']){
   const ff=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0',
    '-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',path.join(dir,file)],{encoding:'utf8'});
   assert.equal(ff.status,0,ff.stderr);assert.equal(Number(ff.stdout.trim()),12);
  }
 }finally{template.close();fs.rmSync(dir,{recursive:true,force:true})}
});
