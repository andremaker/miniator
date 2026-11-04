'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compileComposition}=require('../../src');

test('parameterized session preserves native frames and props across A/B/A without recreating tabs',
 {skip:!(process.env.CEF_ROOT && process.env.DISPLAY && (()=>{try{require.resolve('esbuild');require.resolve('react');return true}catch{return false}})()), timeout:120000},async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-session-qa-'));
 const compiled=await compileComposition({source:path.resolve(__dirname,'../../examples/animated-title.tsx'),
  width:320,height:180,fps:30,durationInFrames:12});
 const session=compiled.createSession({tabs:2,slots:4});
 try{
  await session.ready;
  const results=[];
  for(const [index,title] of ['A','B','A'].entries()){
   results.push(await session.render({output:path.join(output,`${index}.mp4`),props:{title}}));
  }
  assert.equal(results[0].hash,results[2].hash);
  assert.notEqual(results[0].hash,results[1].hash);
  assert.equal(results[0].tabs_setup,2);
  assert.equal(results[1].tabs_setup,0);
  assert.equal(results[2].tabs_setup,0);
  assert.equal(results[1].reused_tabs,true);
  assert.equal(results[2].reused_tabs,true);
  for(let i=0;i<3;i++){
   const check=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0',
    '-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',path.join(output,`${i}.mp4`)],{encoding:'utf8'});
   assert.equal(check.status,0,check.stderr);
   assert.equal(Number(check.stdout.trim()),12);
  }
  const oneoff=await compiled.render({output:path.join(output,'oneoff-b.mp4'),props:{title:'B'},tabs:2,slots:4});
  assert.equal(oneoff.hash,results[1].hash,'changing props must match independent render');
  assert.throws(()=>compiled.close(),/active sessions/);
 }finally{await session.close();compiled.close();fs.rmSync(output,{recursive:true,force:true})}
});

test('parameterized session requires an isolated workspace and validates options',()=>{
 const {createSession}=require('../../src');
 assert.throws(()=>createSession({parameterized:true}),/isolated workspace/);
 assert.throws(()=>createSession({slots:0}),/Invalid session concurrency/);
});
