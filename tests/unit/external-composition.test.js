"use strict";
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compileComposition}=require('../../src');
test('compile independent React TSX from external directory, with no fixture writes', {skip:(()=>{try{require.resolve('esbuild');require.resolve('react');return false}catch{return 'React/esbuild dependencies not installed'}})()},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'miniator-test-'));
 const source=path.join(dir,'scene.tsx');
 fs.writeFileSync(source,"import React from 'react'; export default function Title({frame,title}) { return <h1>{title} {frame}</h1> }");
 let c;try{
  c=await compileComposition({source,width:320,height:180,fps:30,durationInFrames:12});
  assert.equal(c.composition.width,320);assert.match(c.compilationHash,/^[a-f0-9]{64}$/);
  assert.equal(typeof c.render,'function');c.close();
  await assert.rejects(c.render({output:path.join(dir,'test.mp4')}),/closed/);
 }finally{c?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('reject unsafe external configuration',async()=>{
 await assert.rejects(compileComposition({source:'missing',width:1,height:1,fps:30,durationInFrames:10}),/ENOENT/);
});
