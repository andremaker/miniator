'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {APPROVED,EXPERIMENTAL,planApprovedInput,stableInputHash,resolveInputPrediction}=require('../../engine/optimization_policy');
const composition={width:960,height:540,fps:30,durationInFrames:90};
const sourceHash='source-hash';
const props={title:'A'};
const record=(strategy,extra={})=>({
 source_sha256:sourceHash,params_sha256:stableInputHash(props),composition,
 qa_passed:true,strategy,tabs:4,slots:8,...extra
});
function choose(choices=[],overrides={}){
 return planApprovedInput({composition,sourceHash,props,registry:{choices},
  staticAvailable:true,tabs:3,slots:4,...overrides});
}
const regions=[{x:10,y:10,width:110,height:90},{x:600,y:10,width:100,height:90}];
const roi={x:100,y:80,width:280,height:220};

test('approved capabilities are independent of historical per-scene QA',()=>{
 assert.equal(APPROVED.roi,true);
 assert.equal(APPROVED.packedRegions,true);
 assert.equal(APPROVED.trailingRepetition,true);
 assert.equal(APPROVED.predictiveAtlas,true);
 assert.equal(APPROVED.pipelineOverlap,true);
 assert.equal(EXPERIMENTAL.visualCache,true);
});
test('unknown scene uses full-frame transport fallback without blocking future predictions',()=>{
 const r=choose();
 assert.equal(r.selected.name,'full-react');
 assert.deepEqual(r.plan.capture,{x:0,y:0,width:960,height:540});
 assert.equal(r.plan.optimizations.frameRepetition,false);
});
test('the planner can activate approved ROI WITHOUT QA record, including fresh parameters',()=>{
 const prediction={background:'141414',capture:roi};
 for(const title of ['A','B','C']){
  const r=choose([],{props:{title},prediction});
  assert.equal(r.selected.name,'single-roi');
  assert.equal(r.origin,'input-planner');
  assert.deepEqual(r.plan.capture,roi);
 }
});
test('ROI prediction takes priority over older QA hints',()=>{
 const r=choose([record('full-static')],{prediction:{background:'141414',capture:roi}});
 assert.equal(r.selected.name,'single-roi');
 assert.equal(r.record,null);
});
test('source/parameter scoped prior measurements can be reused as hints, not as an algorithm allowlist',()=>{
 const r=choose([record('packed-regions',{background:'141414',regions})]);
 assert.equal(r.selected.name,'packed-regions');
 assert.deepEqual(r.plan.packedRegions,regions);
 assert.equal(r.origin,'cached-prediction');
 assert.equal(choose([record('packed-regions',{background:'141414',regions})],{props:{title:'different'}}).selected.name,'full-react');
});
test('predicted packed regions are automatic and do not require a registry record',()=>{
 const r=choose([],{prediction:{background:'141414',regions}});
 assert.equal(r.selected.name,'packed-regions');
 assert.deepEqual(r.plan.packedRegions,regions);
});
test('independently supported ROI and tail repetition COMBINE by default',()=>{
 const repetition={type:'identical-trailing-frames',start:60,clones:29};
 const r=choose([record('single-roi',{background:'141414',single:roi,repeat:repetition})]);
 assert.equal(r.selected.name,'single-roi+tail');
 assert.deepEqual(r.plan.optimizations.frameRepetition,repetition);
});
test('an invalid repeat instruction must not discard an otherwise valid ROI',()=>{
 const r=choose([],{prediction:{background:'141414',capture:roi,
  repetition:{type:'identical-trailing-frames',start:60,clones:30}}});
 assert.equal(r.selected.name,'single-roi');
 assert.equal(r.plan.optimizations.frameRepetition,false);
});
test('static DOM is automatic only when compiler output is available, preserving independent ROI',()=>{
 const prediction={background:'141414',capture:roi,staticDOM:true};
 assert.equal(choose([],{prediction,staticAvailable:true}).selected.name,'single-roi+static');
 assert.equal(choose([],{prediction,staticAvailable:false}).selected.name,'single-roi');
});
test('invalid geometry falls back; region bounds and chroma alignment are enforced',()=>{
 assert.equal(choose([],{prediction:{background:'141414',capture:{...roi,x:900}}}).selected.name,'full-react');
 assert.equal(choose([],{prediction:{background:'141414',regions:[{...regions[0],x:11},regions[1]]}}).selected.name,'full-react');
});
test('an explicitly supplied incompatible prediction is not replaced by an unrelated registry entry',()=>{
 const old=record('single-roi',{background:'141414',single:roi});
 const result=choose([old],{prediction:{background:'141414',capture:{...roi,x:900}}});
 assert.equal(result.selected.name,'full-react');
});
test('explicit off disables scene-specific selection even when a prediction is available',()=>{
 const r=choose([],{prediction:{background:'141414',capture:roi},policy:'off'});
 assert.equal(r.selected.name,'full-react');
 assert.equal(r.reason,'explicitly-disabled');
});
test('all public paths route through the common selector and preserve selected repetition',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../engine/plan_renderer.js'),'utf8');
 for(const mode of ['chosen','external','external-session'])assert.ok(source.includes("mode==='"+mode+"'"));
 assert.ok(source.includes('function planForInput(props)'));
 assert.ok(source.includes('selectedRepetition(selected)'));
 assert.ok(source.includes("autoOptimizations?'on':'off'"));
 assert.ok(source.includes("autoOptimizations?'auto':'off'"));
});

test('parameter-invariant and input-scoped predictions are resolved before rendering',()=>{
 const predicted={background:'141414',capture:roi};
 const staticPlan={source_sha256:sourceHash,parameterInvariant:true,plan:predicted};
 assert.deepEqual(resolveInputPrediction({declarations:staticPlan,sourceHash,props:{title:'anything'}}),predicted);
 assert.equal(resolveInputPrediction({declarations:staticPlan,sourceHash:'changed',props}),undefined);
 const dynamic={source_sha256:sourceHash,parameterDependencies:['title'],
  byDependencyHash:{[stableInputHash({title:'A'})]:predicted}};
 assert.deepEqual(resolveInputPrediction({declarations:dynamic,sourceHash,props:{title:'A',irrelevant:1}}),predicted);
 assert.equal(resolveInputPrediction({declarations:dynamic,sourceHash,props:{title:'B'}}),undefined);
});
