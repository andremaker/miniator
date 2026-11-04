'use strict';

// Release-level approval is independent of any particular scene's QA record.
// A compiler or input-dependent planner supplies geometry and frame invariants;
// the executor never decides whether a particular scene has earned permission
// to use an approved optimization.
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const stableInputHash=props=>hash(JSON.stringify(props));

const APPROVED=Object.freeze({
  roi:true,
  packedRegions:true,
  trailingRepetition:true,
  staticCompiler:true,
  predictiveAtlas:true,
  pipelineOverlap:true,
  earlyEncoder:true,
  yuvBeforePad:true,
  persistentTabs:true,
  sharedMemoryCapture:true,
  nativeTileExtraction:true
});
// These techniques remain available to experiments, never selected blindly.
const EXPERIMENTAL=Object.freeze({visualCache:true,layerReuse:true,domFactor:true});

function fullFrame(composition){
 return {version:2,composition,
  capture:{x:0,y:0,width:composition.width,height:composition.height},
  background:{mode:'none'},domReplay:{enabled:false},
  optimizations:{frameRepetition:false,layerReuse:false,visualCache:false},
  validated:false};
}
function validRect(rect,c){
 return rect&&['x','y','width','height'].every(k=>Number.isInteger(rect[k]))&&
  rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&
  rect.x+rect.width<=c.width&&rect.y+rect.height<=c.height;
}
function evenRect(r){return ['x','y','width','height'].every(k=>r[k]%2===0);}
function validBackground(bg){return typeof bg==='string'&&/^[0-9a-f]{6}$/i.test(bg.replace(/^#/,''));}
function validRepetition(r,c){
 return r&&r.type==='identical-trailing-frames'&&Number.isInteger(r.start)&&
  Number.isInteger(r.clones)&&r.start>=0&&r.clones>=1&&
  r.start+r.clones===c.durationInFrames-1;
}
function resolveInputPrediction({declarations,sourceHash,props={}}){
 if(!declarations||declarations.source_sha256!==sourceHash)return undefined;
 if(declarations.parameterInvariant===true)return declarations.plan;
 if(!Array.isArray(declarations.parameterDependencies))return undefined;
 const relevant=Object.fromEntries(declarations.parameterDependencies.map(k=>[k,props[k]]));
 return declarations.byDependencyHash?.[stableInputHash(relevant)];
}
function matchingApprovedRecord({registry,sourceHash,props,composition}){
 const propsHash=stableInputHash(props);
 // This is ONLY a source of reusable known-good predictions/tuning hints.
 // Records are not required in order to use approved algorithms.
 return (registry?.choices||[]).find(r=>r.qa_passed===true&&
   r.source_sha256===sourceHash&&r.params_sha256===propsHash&&
   JSON.stringify(r.composition)===JSON.stringify(composition))||null;
}
function choiceFromPrediction({prediction,composition,staticAvailable,defaultChoice}){
 if(!prediction||typeof prediction!=='object')return null;
 const bg=prediction.background;
 let plan=fullFrame(composition),name='full-react',dom='react';
 if(prediction.regions!==undefined){
  if(!APPROVED.packedRegions||!validBackground(bg)||
    !Array.isArray(prediction.regions)||prediction.regions.length<2||prediction.regions.length>4||
    !prediction.regions.every(r=>validRect(r,composition)&&evenRect(r)))return null;
  const packedWidth=prediction.regions.reduce((sum,r)=>sum+r.width,0);
  if(packedWidth>8192||Math.max(...prediction.regions.map(r=>r.height))>8192)return null;
  plan={...plan,packedRegions:prediction.regions,background:{mode:'solid',color:bg.replace(/^#/,'')}};
  name='packed-regions';
 }else if(prediction.capture!==undefined){
  if(!APPROVED.roi||!validRect(prediction.capture,composition)||!validBackground(bg))return null;
  plan={...plan,capture:prediction.capture,background:{mode:'solid',color:bg.replace(/^#/,'')}};
  name='single-roi';
 }
 if(prediction.repetition!==undefined && APPROVED.trailingRepetition &&
    validRepetition(prediction.repetition,composition)){
  plan={...plan,optimizations:{...plan.optimizations,frameRepetition:prediction.repetition}};
  name=name==='full-react'?'tail-repetition':name+'+tail';
 }
 if(prediction.staticDOM===true && APPROVED.staticCompiler && staticAvailable){
  dom='staticjs';name=name==='full-react'?'full-static':name+'+static';
 }
 const tabs=prediction.tabs??defaultChoice.tabs;
 const slots=prediction.slots??defaultChoice.slots;
 if(!Number.isInteger(tabs)||tabs<1||tabs>8||!Number.isInteger(slots)||slots<1||slots>32)return null;
 return {plan,selected:{name,tabs,slots,dom},reason:null};
}
/**
 * One planner contract for fixture, external and parameterized execution.
 *
 * Predictions are produced by source/input analysis BEFORE any capture. No
 * previous output pixel comparison or per-scene QA allowlist is required.
 * When inputs change, the calling planner must supply predictions valid for
 * those inputs; otherwise this path retains the fully functional transport
 * and full-frame execution fallback.
 */
function planApprovedInput({composition,sourceHash,props={},registry,prediction,
                            staticAvailable=false,tabs=4,slots=8,policy='auto'}){
 if(!['auto','off'].includes(policy))throw Error('optimization policy must be auto|off');
 const fallback=fullFrame(composition);
 const defaultChoice={name:'full-react',tabs,slots,dom:'react'};
 if(policy==='off')return {plan:fallback,selected:defaultChoice,record:null,reason:'explicitly-disabled'};
 const record=matchingApprovedRecord({registry,sourceHash,props,composition});
 // Compiler-provided predictions take precedence over an old benchmark record.
 // This is the essential separation of approval and applicability.
 const predicted=choiceFromPrediction({prediction,composition,staticAvailable,defaultChoice});
 if(predicted)return {...predicted,record:null,origin:'input-planner'};
 if(prediction!==undefined){
  return {plan:fallback,selected:defaultChoice,record:null,reason:'prediction-inapplicable'};
 }
 if(record){
  const legacy={background:record.background,capture:undefined,regions:undefined,
    repetition:record.repeat||undefined,staticDOM:record.strategy==='full-static',
    tabs:record.tabs,slots:record.slots};
  if(record.strategy==='single-roi')legacy.capture=record.single;
  else if(record.strategy==='packed-regions')legacy.regions=record.regions;
  else if(!['full-react','full-static','tail-repetition'].includes(record.strategy)){
   return {plan:fallback,selected:defaultChoice,record:null,reason:'unknown-legacy-strategy'};
  }
  // Important: the independently approved trailing-frame algorithm may combine
  // with ROI/packed capture. The previous selector silently discarded it.
  const chosen=choiceFromPrediction({prediction:legacy,composition,staticAvailable,defaultChoice});
  if(chosen)return {...chosen,record,origin:'cached-prediction'};
 }
 return {plan:fallback,selected:defaultChoice,record:null,
  reason:record?'invalid-cached-prediction':'no-applicable-prediction'};
}
module.exports={APPROVED,EXPERIMENTAL,planApprovedInput,matchingApprovedRecord,
 fullFrame,stableInputHash,resolveInputPrediction,choiceFromPrediction,validRect,validRepetition};
