'use strict';
// Generic precompiled HTML snapshot playback. All scene-specific DOM markup,
// styles, text, and per-frame states arrive in RenderPlan data, not source.
(() => {
  const config=window.__MINIATOR_PLAN__;
  const {width,height,durationInFrames}=config.composition;
  const {x,y,width:cw,height:ch}=config.capture;
  const n=config.execution.slots;
  const columns=config.execution.columns||n;
  const snapshots=config.domSnapshots;
  if(!Array.isArray(snapshots)||snapshots.length!==durationInFrames)
    throw Error('Missing compiled HTML timeline');
  const root=document.getElementById('app');
  const slotBodies=[];
  for(let i=0;i<n;i++){
    const outer=document.createElement('div');
    Object.assign(outer.style,{position:'absolute',left:`${(i%columns)*cw}px`,top:`${Math.floor(i/columns)*ch}px`,width:`${cw}px`,height:`${ch}px`,overflow:'hidden'});
    const inner=document.createElement('div');
    Object.assign(inner.style,{position:'absolute',left:`${-x}px`,top:`${-y}px`,width:`${width}px`,height:`${height}px`});
    outer.appendChild(inner);root.appendChild(outer);slotBodies.push(inner);
  }
  const template=document.createElement('template');
  // Keep existing nodes in place whenever compatible, including elements whose
  // markup is identical at different frames. This is a general DOM-diff update,
  // not a selector-specific optimization for the fixture's title/counter.
  function patch(target,fresh){
    if(target.nodeType!==fresh.nodeType || target.nodeName!==fresh.nodeName){target.replaceWith(fresh.cloneNode(true));return;}
    if(target.nodeType===3 || target.nodeType===8){if(target.nodeValue!==fresh.nodeValue)target.nodeValue=fresh.nodeValue;return;}
    if(target.nodeType!==1)return;
    for(const attr of [...target.attributes])if(!fresh.hasAttribute(attr.name))target.removeAttribute(attr.name);
    for(const attr of [...fresh.attributes])if(target.getAttribute(attr.name)!==attr.value)target.setAttribute(attr.name,attr.value);
    let i=0;
    while(i<fresh.childNodes.length){const child=fresh.childNodes[i];
      const prev=target.childNodes[i];
      if(!prev)target.appendChild(child.cloneNode(true));
      else patch(prev,child);
      i++;
    }
    while(target.childNodes.length>fresh.childNodes.length)target.lastChild.remove();
  }
  let current=Array(n).fill(-1);
  function update(slot,frame){
    if(current[slot]===frame)return;
    template.innerHTML=snapshots[frame];
    const next=template.content;
    const dst=slotBodies[slot];
    let i=0;while(i<next.childNodes.length){
      if(i>=dst.childNodes.length)dst.appendChild(next.childNodes[i].cloneNode(true));
      else patch(dst.childNodes[i],next.childNodes[i]);
      i++;
    }
    while(dst.childNodes.length>next.childNodes.length)dst.lastChild.remove();
    current[slot]=frame;
  }
  for(let i=0;i<n;i++)update(i,0);
  window.drawBatch=async(start,total,slots)=>{
    if(total!==durationInFrames||slots!==n)throw Error('Timeline mismatch');
    const frames=[];
    for(let i=0;i<n;i++){const frame=Math.min(total-1,start+i);update(i,frame);frames.push(frame);}
    await Promise.resolve();return frames;
  };
  window.remotionAtlasReady=async()=>{await document.fonts.ready;return true;};
})();
