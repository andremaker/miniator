import React, {useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MiniatorFrameProvider} from './timeline';
import {Scene} from './scene_adapter';

// Runtime-input-sensitive factoring. There is exactly one React scene per tab.
// Its live DOM is evaluated for every requested frame, then copied/patched into
// atlas slots. Unchanged slot nodes stay mounted across frames (no React roots
// in the slots). No DOM frames or rendered pixels are saved between jobs.
const conf=(window as any).__MINIATOR_PLAN__;
if(!conf?.composition||!conf?.capture)throw Error('Invalid plan config');
const {width,height,fps,durationInFrames}=conf.composition;
const {x,y,width:tileWidth,height:tileHeight}=conf.capture;
const slots=conf.execution.slots;
const columns=conf.execution.columns||slots;
const videoConfig={width,height,fps,durationInFrames};
function OriginalFrame({frame}:{frame:number}){
 return <MiniatorFrameProvider frame={frame} config={videoConfig}><Scene/></MiniatorFrameProvider>;
}
const app=document.getElementById('app')!;
const hidden=document.createElement('div');
Object.assign(hidden.style,{position:'absolute',left:`${-(width+100)}px`,top:'0px',width:width+'px',height:height+'px',visibility:'hidden',pointerEvents:'none'});
document.body.appendChild(hidden);
const reactRoot=createRoot(hidden);
const buffers:HTMLElement[]=[];
for(let i=0;i<slots;i++){
 const outer=document.createElement('div');
 Object.assign(outer.style,{position:'absolute',left:((i%columns)*tileWidth)+'px',top:(Math.floor(i/columns)*tileHeight)+'px',width:tileWidth+'px',height:tileHeight+'px',overflow:'hidden'});
 const inner=document.createElement('div');
 Object.assign(inner.style,{position:'absolute',left:-x+'px',top:-y+'px',width:width+'px',height:height+'px'});
 outer.append(inner);app.append(outer);buffers.push(inner);
}
function patchStyle(a:HTMLElement,b:HTMLElement){
 const target=a.style,fresh=b.style;
 const names=Array.from(fresh);
 for(const name of Array.from(target))if(!name.startsWith('--miniator-')&&!names.includes(name)){
   target.removeProperty(name);
 }
 for(const name of names){
  const value=fresh.getPropertyValue(name);
  const old=target.getPropertyValue(name);
  const key='--miniator-'+name.replace(/[^a-zA-Z0-9-]/g,'-');
  if(old===`var(${key})`){
    if(target.getPropertyValue(key)!==value)target.setProperty(key,value);
  }else if(old!==value){
    target.setProperty(key,value);
    target.setProperty(name,`var(${key})`);
  }
 }
}
function patch(target:Node,fresh:Node){
 if(target.nodeType!==fresh.nodeType||target.nodeName!==fresh.nodeName){target.replaceWith(fresh.cloneNode(true));return;}
 if(target.nodeType===3||target.nodeType===8){if(target.nodeValue!==fresh.nodeValue)target.nodeValue=fresh.nodeValue;return;}
 if(target.nodeType!==1)return;
 const a=target as Element,b=fresh as Element;
 for(const att of Array.from(a.attributes))if(att.name!=='style'&&!b.hasAttribute(att.name))a.removeAttribute(att.name);
 for(const att of Array.from(b.attributes)){
   if(att.name==='style')patchStyle(a as HTMLElement,b as HTMLElement);
   else if(a.getAttribute(att.name)!==att.value)a.setAttribute(att.name,att.value);
 }
 let j=0;for(;j<b.childNodes.length;j++){
   if(j<a.childNodes.length)patch(a.childNodes[j],b.childNodes[j]);
   else a.appendChild(b.childNodes[j].cloneNode(true));
 }
 while(a.childNodes.length>j)a.lastChild!.remove();
}
let first=true;
function evaluateFrame(slot:number,frame:number){
 flushSync(()=>reactRoot.render(<OriginalFrame frame={frame}/>));
 // Static structure is cloned only once for each slot; subsequent frames update
 // attributes/text in place. Inputs are evaluated anew for every render job.
 const src=hidden,dst=buffers[slot];
 let j=0;for(;j<src.childNodes.length;j++){if(j<dst.childNodes.length)patch(dst.childNodes[j],src.childNodes[j]);else dst.appendChild(src.childNodes[j].cloneNode(true));}
 while(dst.childNodes.length>j)dst.lastChild!.remove();
}
(window as any).drawBatch=async(start:number,total:number,n:number)=>{
 if(n!==slots||total!==durationInFrames)throw Error('Timeline mismatch');
 const frames=[];
 for(let i=0;i<slots;i++){
  const f=Math.min(total-1,start+i);
  evaluateFrame(i,f);frames.push(f);
 }
 return frames;
};
(window as any).miniatorAtlasReady=async()=>{await (document as any).fonts.ready;return true;};
(window as any).drawBatch(0,durationInFrames,slots);
