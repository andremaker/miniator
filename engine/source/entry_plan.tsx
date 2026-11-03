import React, {useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Internals} from 'remotion';
import {Scene} from './scene_adapter';

// Runtime geometry and composition configuration come entirely from the
// compiled RenderPlan. No animation text, DOM selectors, coordinates, scene
// structure or background colors are embedded in this renderer.
const conf = (window as any).__MINIATOR_PLAN__;
if (!conf?.composition || !conf?.capture) throw new Error('Compiled RenderPlan missing');
const {width, height, fps, durationInFrames} = conf.composition;
const {x, y, width: tileWidth, height: tileHeight} = conf.capture;
const count = conf.execution.slots;
const columns = conf.execution.columns || count;
const id = 'miniator-scene';
const env = {isPlayer:true, isRendering:false, isStudio:false,
  isClientSideRendering:false, isReadOnlyStudio:false};
const composition = {component:Scene, durationInFrames, width, height, fps,
  id, order:null, folderName:null, parentFolderName:null, schema:null,
  calculateMetadata:null, stack:null};
const manager = {compositions:[composition], folders:[],
  currentAssetMetadata:null,
  currentCompositionMetadata:{defaultCodec:null, defaultOutName:null,
    defaultPixelFormat:null, defaultProResProfile:null, defaultSampleRate:null,
    defaultVideoImageFormat:null, durationInFrames, width, height, fps, props:{}},
  canvasContent:{type:'composition' as const, compositionId:id}};
const logLevel = {logLevel:'error' as const, mountTime:Date.now()};
function FrameSlot({slot, frame}:{slot:number,frame:number}){
  const timeline=useMemo(()=>({frame:{[id]:frame}, isPlaying:()=>false,
    isInsideFreeze:false, audioAndVideoTags:{current:[]}}),[frame]);
  const outer:React.CSSProperties={position:'absolute',left:(slot%columns)*tileWidth,top:Math.floor(slot/columns)*tileHeight,
    width:tileWidth,height:tileHeight,overflow:'hidden'};
  const inner:React.CSSProperties={position:'absolute',left:-x,top:-y,width,height};
  return <div style={outer}><div style={inner}>
    <Internals.TimelineContext.Provider value={timeline}>
      <Internals.AbsoluteTimeContext.Provider value={timeline}>
        <Scene />
      </Internals.AbsoluteTimeContext.Provider>
    </Internals.TimelineContext.Provider>
  </div></div>;
}
const App=({frames}:{frames:number[]})=>
  <Internals.IsPlayerContextProvider>
    <Internals.RemotionEnvironmentContext.Provider value={env}>
      <Internals.LogLevelContext.Provider value={logLevel}>
        <Internals.CanUseRemotionHooksProvider>
          <Internals.CompositionManager.Provider value={manager}>
            <Internals.VideoProvider>
              {frames.map((frame,slot)=><FrameSlot key={slot} slot={slot} frame={frame}/>)}
            </Internals.VideoProvider>
          </Internals.CompositionManager.Provider>
        </Internals.CanUseRemotionHooksProvider>
      </Internals.LogLevelContext.Provider>
    </Internals.RemotionEnvironmentContext.Provider>
  </Internals.IsPlayerContextProvider>;
const root=createRoot(document.getElementById('app')!);
const draw=(frames:number[])=>flushSync(()=>root.render(<App frames={frames}/>));
draw(Array(count).fill(0));
(window as any).drawBatch=async(start:number,total:number,slots:number)=>{
  if(slots!==count||total!==durationInFrames)throw new Error('Composition timeline mismatch');
  const frames=Array.from({length:count},(_,i)=>Math.min(total-1,start+i));
  draw(frames);
  // The screenshot command is Chromium's raster barrier. The compiler validates
  // the final MP4; no template-dependent synchronization shortcuts are assumed.
  await Promise.resolve();
  return frames;
};
(window as any).remotionAtlasReady=async()=>{await document.fonts.ready;return true;};
