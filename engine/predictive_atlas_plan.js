'use strict';
// Pure, pre-render atlas scheduling. No browser, DOM reads, captures or output pixels.
// Frame descriptions must come from source analysis or explicit template contracts.
// A declaration that props don't affect geometry/complexity is a compiler guarantee,
// not something inferred by looking at only one parameter sample.
const crypto=require('crypto');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const positive=(x,k)=>{if(!Number.isFinite(x)||x<=0)throw Error(`Invalid ${k}: ${x}`);return x};
const validRect=(r)=>{if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)throw Error('Invalid predicted rectangle');return r};
function normalizedFrame(f,params){
 const v=typeof f==='function'?f(params):f;
 if(!v||!Array.isArray(v.regions)||!v.regions.length)throw Error('Frame predictor must return at least one region');
 const regions=v.regions.map(validRect);
 const pixels=regions.reduce((s,r)=>s+r.width*r.height,0);
 const width=regions.reduce((s,r)=>s+r.width,0),height=Math.max(...regions.map(r=>r.height));
 const complexity=positive(v.complexity??1,'complexity');
 // Complexity is a relative predicted paint-cost factor, independent of pixel area.
 const paintUnits=pixels*complexity+regions.length*8000;
 return {regions,rect:{width,height},regionPixels:pixels,paintUnits,complexity};
}
function estimateAtlas(frames,options){
 let x=0,y=0,rowHeight=0,usedWidth=0;
 const slots=[];
 for(const [i,f] of frames.entries()){
  if(f.rect.width>options.maxWidth||f.rect.height>options.maxHeight)return null;
  if(x&&x+f.rect.width>options.maxWidth){y+=rowHeight;x=0;rowHeight=0;}
  if(y+f.rect.height>options.maxHeight)return null;
  slots.push({frame:i,x,y,width:f.rect.width,height:f.rect.height,regions:f.regions});
  usedWidth=Math.max(usedWidth,x+f.rect.width);rowHeight=Math.max(rowHeight,f.rect.height);x+=f.rect.width;
 }
 const usedHeight=y+rowHeight;
 const pixels=usedWidth*usedHeight;
 const bytes=pixels*4*options.surfaceCopies;
 const paintUnits=frames.reduce((s,f)=>s+f.paintUnits,0);
 const cost=options.captureOverhead+paintUnits*options.paintUnitCost+pixels*options.capturePixelCost;
 return {slots,width:usedWidth,height:usedHeight,pixels,bytes,paintUnits,cost};
}
function packPredictedFrames(frames,config={}){
 const options={maxWidth:32768,maxHeight:8192,surfaceCopies:6,maxBytes:128*1024*1024,
  maxSlots:32,captureOverhead:3.5,paintUnitCost:0.000002,capturePixelCost:0.000001,
  targetCost:70,...config};
 for(const k of ['maxWidth','maxHeight','surfaceCopies','maxBytes','maxSlots','captureOverhead','targetCost'])positive(options[k],k);
 const batches=[];
 let cursor=0;
 while(cursor<frames.length){
  let best=null,count=0;
  while(cursor+count<frames.length&&count<options.maxSlots){
   const batch=estimateAtlas(frames.slice(cursor,cursor+count+1),options);
   if(!batch||batch.bytes>options.maxBytes)break;
   // Closing at the predicted optimal upper cost avoids wasting oversized atlas
   // allocations or painting more expensive batches than necessary.
   if(count>0&&batch.cost>options.targetCost)break;
   best=batch;count++;
  }
  if(!best)throw Error(`Predicted frame ${cursor} exceeds atlas memory/dimensions budget`);
  batches.push({...best,startFrame:cursor,count});cursor+=count;
 }
 return {batches,frameCount:frames.length,estimatedTotalCost:batches.reduce((s,b)=>s+b.cost,0),maxBatchBytes:Math.max(0,...batches.map(b=>b.bytes)),options};
}
function compileTemplateAtlas({sourceHash,frameDescriptors,parameterDependencies=[],config={}}){
 if(!sourceHash||!Array.isArray(frameDescriptors)||!frameDescriptors.length)throw Error('Missing template source or frames');
 const dependencies=[...new Set(parameterDependencies)].sort();
 const staticPlan=dependencies.length?null:packPredictedFrames(frameDescriptors.map(f=>normalizedFrame(f,{})),config);
 return {version:1,sourceHash,dependencies,staticPlan,config,frameDescriptors,
  // On dependency-free templates, every render uses the same atlas plan.
  // Otherwise only known dependency values participate in the cache key.
  planFor(props={},cache=new Map()){
   if(staticPlan)return {...staticPlan,origin:'template-preplanned',cacheKey:sourceHash};
   const relevant=Object.fromEntries(dependencies.map(k=>[k,props[k]]));
   const key=digest([sourceHash,relevant]);
   if(cache.has(key))return {...cache.get(key),origin:'input-plan-cache',cacheKey:key};
   const plan=packPredictedFrames(frameDescriptors.map(f=>normalizedFrame(f,props)),config);
   cache.set(key,plan);
   return {...plan,origin:'predicted-before-render',cacheKey:key};
  }
 };
}
module.exports={compileTemplateAtlas,packPredictedFrames,normalizedFrame,estimateAtlas};
