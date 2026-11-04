import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Scene} from './scene_adapter';

// This entry uses the Miniator scene contract and React only. The composition
// receives explicit deterministic frame/time and user props on each update.
const conf=(window as any).__MINIATOR_PLAN__;
if(!conf?.composition || !conf?.execution) throw Error('Missing Miniator composition configuration');
const {width,height,fps,durationInFrames}=conf.composition;
const {slots,columns=slots}=conf.execution;
const {x,y,width:tileWidth,height:tileHeight}=conf.capture;
let userProps=conf.inputProps||{};
let lastFrames:number[]=Array(slots).fill(0);
const root=createRoot(document.getElementById('app')!);
function App({frames}:{frames:number[]}) {
 return <>{frames.map((frame,slot)=>
  <div key={slot} style={{position:'absolute',left:(slot%columns)*tileWidth,
     top:Math.floor(slot/columns)*tileHeight,width:tileWidth,height:tileHeight,overflow:'hidden'}}>
   <div style={{position:'absolute',left:-x,top:-y,width,height}}>
    <Scene {...userProps} frame={frame} timeInSeconds={frame/fps}
      fps={fps} width={width} height={height} durationInFrames={durationInFrames}/>
   </div>
  </div>)}</>;
}
const draw=(frames:number[])=>{
 lastFrames=frames;
 flushSync(()=>root.render(<App frames={frames}/>));
};
// Update props inside the existing React root. Do not recreate the page, atlas,
// root or scene bundle. This contract is for deterministic props/frame-driven
// compositions; stateful cross-render semantics require a remount strategy.
(window as any).__MINIATOR_SET_INPUT_PROPS__=(next:Record<string,unknown>)=>{
 if(next===null||typeof next!=='object'||Array.isArray(next))throw Error('Expected JSON props object');
 userProps=next;
 draw(lastFrames);
 return true;
};
draw(Array(slots).fill(0));
(window as any).drawBatch=async(start:number,total:number,count:number)=>{
 if(total!==durationInFrames||count!==slots)throw Error('Timeline mismatch');
 const frames=Array.from({length:slots},(_,i)=>Math.min(total-1,start+i));
 draw(frames);await Promise.resolve();return frames;
};
(window as any).miniatorAtlasReady=async()=>{await document.fonts.ready;return true};
