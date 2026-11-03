'use strict';
// Host-aware, scene-independent atlas geometry and memory-capacity model.
// This is a candidate predictor, not a claim that the maximum-fitting atlas is fastest.
const fs=require('fs'),os=require('os');
const MiB=1024*1024;
function integerFile(path,fallback){try{const x=fs.readFileSync(path,'utf8').trim();return x==='max'?fallback:Number(x)}catch{return fallback}}
function hostBudget(){
 const limit=integerFile('/sys/fs/cgroup/memory.max',os.totalmem());
 const current=integerFile('/sys/fs/cgroup/memory.current',0);
 const cpu=String(fs.existsSync('/sys/fs/cgroup/cpu.max')?fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8'):'max').trim().split(/\s+/);
 const cores=cpu[0]==='max'?os.availableParallelism?.()||os.cpus().length:Math.max(1,Math.ceil(Number(cpu[0])/Number(cpu[1])));
 const headroom=Math.max(0,limit-current);
 // Preserve 20% of the limit plus a minimum 384 MiB for OS, FFmpeg and unexpected compositor allocations.
 const reserve=Math.max(384*MiB,Math.round(limit*0.20));
 return {limit,current,headroom,reserve,usable:Math.max(0,headroom-reserve),cores};
}
function sceneComplexity(source=''){
 const nodes=(source.match(/<[A-Za-z][\w.]*(?=[\s/>])/g)||[]).length;
 const effects=(source.match(/filter\s*:|boxShadow|textShadow|blur\(|drop-shadow|backdropFilter|mixBlendMode/g)||[]).length;
 const transforms=(source.match(/transform\s*:|rotate\(|scale\(|translate\(|interpolate\(/g)||[]).length;
 const gradients=(source.match(/gradient\(/g)||[]).length;
 const factor=1+Math.min(3.5,0.011*nodes+0.14*effects+0.025*transforms+0.12*gradients);
 return {nodes,effects,transforms,gradients,factor:Math.round(factor*100)/100};
}
function rectSize(rect,regions){
 if(!regions?.length)return {width:rect.width,height:rect.height,actualRegionPixels:rect.width*rect.height};
 // Matches current packed strip implementation: each region contributes its width to one horizontal strip.
 return {width:regions.reduce((s,r)=>s+r.width,0),height:Math.max(...regions.map(r=>r.height)),
 actualRegionPixels:regions.reduce((s,r)=>s+r.width*r.height,0)};
}
function geometry(slots,w,h){
 // Prefer a single strip when it fits. Use grid only for overflow; the capture/encoder supports atlas grids.
 const maxCols=Math.floor(32768/w),maxRows=Math.floor(8192/h);
 if(maxCols<1||maxRows<1)return null;
 const columns=Math.min(slots,maxCols),rows=Math.ceil(slots/columns);
 if(rows>maxRows)return null;
 return {columns,rows,width:columns*w,height:rows*h,atlasPixels:columns*w*rows*h};
}
function predictCandidates({capture,regions=null,source='',frames,tabsMax=8,slotsMax=96,host=hostBudget(),maxCandidates=8}){
 const physical=rectSize(capture,regions);
 if(physical.width<1||physical.height<1)throw Error('Invalid capture rectangle');
 const complexity=sceneComplexity(source);
 // Two frame-pool buffers, compositor/paint surfaces, native extraction, staging and a safety factor.
 const surfaceCopies=6;
 const domPerSlot=(0.65+0.12*complexity.factor)*MiB;
 const basePerTab=46*MiB;
 const maxAtlasBudget=Math.min(host.usable*0.62,host.limit*0.33);
 const candidateTabs=[...new Set([Math.min(host.cores,4),Math.min(host.cores,3),2,1].filter(t=>t>0&&t<=tabsMax))];
 const pixels=physical.width*physical.height;
 const preferred=Math.max(2,Math.round(8*Math.sqrt(400000/Math.max(1,pixels))/Math.sqrt(complexity.factor)));
 const candidates=[];
 for(const tabs of candidateTabs){
  const memoryCap=Math.floor((maxAtlasBudget/tabs-basePerTab)/(surfaceCopies*pixels*4+domPerSlot));
  const maxSlots=Math.min(slotsMax,frames,Math.max(0,memoryCap));
  if(maxSlots<1)continue;
  const slotSuggestions=new Set([1,Math.max(2,Math.floor(preferred/2)),preferred,Math.ceil(preferred*1.5),preferred*2,maxSlots]);
  for(const slots of slotSuggestions){
   if(slots>maxSlots||slots<1)continue;
   const g=geometry(slots,physical.width,physical.height);
   if(!g)continue;
   const memoryBytes=Math.ceil(tabs*(basePerTab+surfaceCopies*g.atlasPixels*4+domPerSlot*slots));
   if(memoryBytes>maxAtlasBudget)continue;
   const batches=Math.ceil(frames/(tabs*slots));
   // Capture fixed cost, scene-update cost and a penalty for excessive DOM slots and atlas work.
   // Calibration measurements override this ranking whenever available.
   const score=batches*9.0 + frames*0.09*complexity.factor +
    batches*pixels*slots*0.0000008 + tabs*slots*(0.23*complexity.factor + pixels*0.0000003);
   candidates.push({tabs,slots,columns:g.columns,rows:g.rows,atlasBytes:Math.round(g.atlasPixels*4),
     predictedMemoryBytes:memoryBytes,predictedScore:Math.round(score*100)/100,batches});
  }
 }
 candidates.sort((a,b)=>a.predictedScore-b.predictedScore||a.predictedMemoryBytes-b.predictedMemoryBytes);
 // Always sample multiple tab counts when physically viable.
 const chosen=[];
 for(const c of candidates){if(!chosen.some(x=>x.tabs===c.tabs))chosen.push(c);if(chosen.length>=Math.min(2,maxCandidates))break;}
 for(const c of candidates){if(chosen.length>=maxCandidates)break;if(!chosen.some(x=>x.tabs===c.tabs&&x.slots===c.slots))chosen.push(c);}
 return {host,physical,complexity,preferredSlots:preferred,maxAtlasBudget,candidates:chosen,allCandidateCount:candidates.length};
}
module.exports={hostBudget,sceneComplexity,rectSize,geometry,predictCandidates};
