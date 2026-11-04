// Miniator's optional Hello-only imperative optimization adapter.
// This is project-authored code, not vendored framework implementation.
import { spring, interpolate } from './timeline_math';
(() => {
  const W = window as any;
  const conf = W.__MINIATOR_PLAN__;
  const originalReady = W.miniatorAtlasReady;
  const originalDraw = W.drawBatch;
  const method = W.__MINIATOR_UPDATE_METHOD__ || 'direct';
  let initialized = false;
  const titleNodes: HTMLElement[] = [];
  const percentNodes: HTMLElement[] = [];
  const suffixes: string[] = [];
  const actualSlots = conf.execution.slots;
  const totalFrames = conf.composition.durationInFrames;
  const fps = conf.composition.fps;
  function changeSlot(slot:number,frame:number){
    const title=titleNodes[slot],counter=percentNodes[slot];
    const rise=spring({frame,fps});
    const fade=interpolate(frame,[0,20],[0,1],{extrapolateRight:'clamp'});
    const percent=interpolate(frame,[30,90],[0,100],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
    const offset=`${(1-rise)*60}px`;
    if(method==='css'){
      title.style.setProperty('--miniator-y',offset);
      title.style.setProperty('--miniator-alpha',String(fade));
      counter.classList.toggle('miniator-hidden',frame<30);
    }else{
      title.style.transform=`translateY(${offset})`;
      title.style.opacity=String(fade);
      if(frame<30)counter.style.setProperty('display','none');
      else counter.style.removeProperty('display');
    }
    counter.textContent=`${Math.round(percent)}%${suffixes[slot]}`;
  }
  W.miniatorAtlasReady=async()=>{
    if(initialized)return true;
    await originalReady();
    await originalDraw(30,totalFrames,actualSlots);
    const outer=document.querySelectorAll('#app > div');
    if(outer.length!==actualSlots)throw Error(`Expected ${actualSlots} atlas slot nodes, found ${outer.length}`);
    for(const o of Array.from(outer)){
      const title=o.querySelector('h1') as HTMLElement|null;
      const counter=o.querySelector('p') as HTMLElement|null;
      if(!title||!counter)throw Error('Scene unsupported by imperative test adapter');
      titleNodes.push(title);percentNodes.push(counter);
      const match=counter.textContent?.match(/^\d+%(.*)$/s);
      if(!match)throw Error('Unexpected counter expression');
      suffixes.push(match[1]);
    }
    if(method==='css'){
      const sheet=document.createElement('style');
      sheet.textContent='.miniator-hidden{display:none!important}';document.head.appendChild(sheet);
      for(const title of titleNodes){title.style.opacity='var(--miniator-alpha)';title.style.transform='translateY(var(--miniator-y))';}
    }
    initialized=true;
    for(let i=0;i<actualSlots;i++)changeSlot(i,0);
    await document.fonts.ready;
    return true;
  };
  W.drawBatch=async(start:number,total:number,slots:number)=>{
    if(!initialized||slots!==actualSlots||total!==totalFrames)throw Error('Invalid imperative atlas state');
    const frames=Array.from({length:slots},(_,i)=>Math.min(total-1,start+i));
    for(let i=0;i<slots;i++)changeSlot(i,frames[i]);
    return frames;
  };
})();
