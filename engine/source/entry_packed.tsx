import React, {useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MiniatorFrameProvider} from './timeline';
import {Scene} from './scene_adapter';
import {initializeMirrors,syncMirrors} from './mutation_mirror';

// Experiment: repeat the unchanged React composition for each disjoint capture
// region. Every copy uses the ORIGINAL video coordinate system, video config,
// and timeline, while its enclosing wrapper clips and translates that view.
// No scene element is reparented; duplicate React/DOM trees are an explicit cost.
const conf=(window as any).__MINIATOR_PLAN__;
if(!conf?.composition||!Array.isArray(conf.regions)||!conf.regions.length) throw Error('Packed regions config missing');
if(conf.execution?.allowExperimentalPacking!==true)throw Error('Packed atlas is experimental; explicit opt-in required');
const {width,height,fps,durationInFrames}=conf.composition;
const count=conf.execution.slots;
const regions=conf.regions as {x:number,y:number,width:number,height:number}[];
const stripWidth=regions.reduce((n,r)=>n+r.width,0);
const stripHeight=Math.max(...regions.map(r=>r.height));
const columns=conf.execution.columns||count;
const containment=conf.execution.containment||'hidden';
const copyMode=conf.execution.copyMode||'react';
if(copyMode==='mirror'&&conf.execution.allowDomMirror!==true)throw Error('DOM mirror requires explicit opt-in');
const videoConfig={width,height,fps,durationInFrames};
for(const r of regions){if(![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.width<=0||r.height<=0||r.x<0||r.y<0||r.x+r.width>width||r.y+r.height>height)throw Error('Invalid region '+JSON.stringify(r));}
function RegionView({slot,regionIndex,frame}:{slot:number,regionIndex:number,frame:number}){
  const region=regions[regionIndex];
  let position=slot%columns*stripWidth;
  for(let i=0;i<regionIndex;i++)position+=regions[i].width;
  const outer:React.CSSProperties={position:'absolute',left:position,top:Math.floor(slot/columns)*stripHeight,width:region.width,height:region.height,
    overflow:containment==='clip'?'clip':'hidden', ...(containment==='clip-paint'?{overflow:'clip',contain:'paint' as const}:{}),
    ...(containment==='hidden-paint'?{overflow:'hidden',contain:'paint' as const}:{})};
  const inner:React.CSSProperties={position:'absolute',left:-region.x,top:-region.y,width,height};
  return <div style={outer}><div style={inner}>
    <MiniatorFrameProvider frame={frame} config={videoConfig}>
        {(copyMode==='clone'||copyMode==='mirror') ? (regionIndex===0 ? <div data-miniator-source={slot}><Scene /></div> : <div data-miniator-clone={`${slot}:${regionIndex}`} />) : <Scene />}
      </MiniatorFrameProvider>
  </div></div>;
}
const App=({frames}:{frames:number[]})=><>{frames.flatMap((frame,slot)=>regions.map((_,index)=><RegionView key={`${slot}/${index}`} slot={slot} regionIndex={index} frame={frame}/>))}</>;
const root=createRoot(document.getElementById('app')!);
const stats={draws:0,reactMs:0,replicationMs:0};
(window as any).miniatorResetStats=()=>{stats.draws=0;stats.reactMs=0;stats.replicationMs=0;};
(window as any).miniatorGetStats=()=>({...stats});
const draw=(frames:number[])=>{
 const start=performance.now();
 flushSync(()=>root.render(<App frames={frames}/>));
 const replicatedFrom=performance.now();
 stats.reactMs+=replicatedFrom-start;stats.draws++;
 if(copyMode==='mirror'){
   initializeMirrors(count,regions.length);
   syncMirrors();
 }else if(copyMode==='clone'){
  // Conservative: the scene must be fully declarative HTML/CSS. Clone after
  // original React has finished rendering; never move the actual React nodes.
  for(let slot=0;slot<count;slot++){
    const src=document.querySelector(`[data-miniator-source="${slot}"]`);
    if(!src) throw Error('Original DOM source missing');
    if(src.querySelector('canvas,video,audio,iframe,object,embed,[contenteditable],input,select,textarea,slot'))throw Error('Clone-mode unsupported interactive/media scene');
    if(document.getAnimations().some(a=>a.playState==='running'))throw Error('Clone-mode unsupported autonomous animation');
    for(let regionIndex=1;regionIndex<regions.length;regionIndex++){
      const target=document.querySelector(`[data-miniator-clone="${slot}:${regionIndex}"]`);
      if(!target)throw Error('Clone destination missing');
      const fragment=document.createDocumentFragment();
      for(const node of Array.from(src.childNodes))fragment.appendChild(node.cloneNode(true));
      target.replaceChildren(fragment);
    }
  }
 }
 stats.replicationMs+=performance.now()-replicatedFrom;
};
draw(Array(count).fill(0));
(window as any).drawBatch=async(start:number,total:number,slots:number)=>{
  if(slots!==count||total!==durationInFrames)throw Error('Timeline mismatch');
  const frames=Array.from({length:count},(_,i)=>Math.min(total-1,start+i));
  draw(frames);await Promise.resolve();return frames;
};
(window as any).miniatorAtlasReady=async()=>{await document.fonts.ready;return true;};
