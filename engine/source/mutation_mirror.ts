// Opt-in DOM mirror: React renders a single source tree per frame slot.
// The mirrors hold independent DOM clones and replay declarative DOM mutations.
// Deliberately rejects stateful browser media, canvas, input, animations and
// SVG reference IDs. Does not claim universal compatibility with React scenes.
type MirrorState={source:Element; targets:Element[]; observer:MutationObserver; maps:Map<Node,Node>[]; records:number; rebuilds:number};
const prohibited='canvas,video,audio,iframe,object,embed,input,select,textarea,slot,[contenteditable],svg,math,dialog';
const mirrors:MirrorState[]=[];
function validate(source:Element){
 if(source.querySelector(prohibited))throw Error('DOM mirror unsafe: stateful or referenced DOM');
 if(document.getAnimations().some(a=>a.playState==='running'))throw Error('DOM mirror unsafe: autonomous animation');
 const ids=source.querySelectorAll('[id]');if(ids.length)throw Error('DOM mirror unsafe: ID references may differ across clones');
}
function copyTree(original:Node,mapped:Map<Node,Node>):Node{
 const clone=original.cloneNode(false);
 mapped.set(original,clone);
 for(const child of Array.from(original.childNodes))clone.appendChild(copyTree(child,mapped));
 return clone;
}
function forgetTree(original:Node,map:Map<Node,Node>){
 for(const child of Array.from(original.childNodes))forgetTree(child,map);
 map.delete(original);
}
function initializeMirrors(count:number,numberOfRegions:number){
 if(mirrors.length)return;
 for(let slot=0;slot<count;slot++){
  const source=document.querySelector(`[data-miniator-source="${slot}"]`);
  if(!source)throw Error('Missing DOM mirror source');validate(source);
  const targets:Element[]=[],maps:Map<Node,Node>[]=[];
  for(let index=1;index<numberOfRegions;index++){
   const target=document.querySelector(`[data-miniator-clone="${slot}:${index}"]`);
   if(!target)throw Error('Missing DOM mirror target');
   const map=new Map<Node,Node>();map.set(source,target);
   const frag=document.createDocumentFragment();
   for(const child of Array.from(source.childNodes))frag.appendChild(copyTree(child,map));
   target.replaceChildren(frag);targets.push(target);maps.push(map);
  }
  const observer=new MutationObserver(()=>{});
  observer.observe(source,{subtree:true,childList:true,attributes:true,characterData:true,attributeOldValue:false});
  mirrors.push({source,targets,observer,maps,records:0,rebuilds:1});
 }
}
function syncMirrors(){
 let changed=0;
 for(const state of mirrors){
  validate(state.source);
  const records=state.observer.takeRecords();changed+=records.length;
  for(const rec of records){
   for(const map of state.maps){
    const target=map.get(rec.target);if(!target)throw Error('Mirror missing target');
    if(rec.type==='attributes'){
     const element=target as Element,original=rec.target as Element,attr=rec.attributeName!;
     if(original.hasAttribute(attr))element.setAttribute(attr,original.getAttribute(attr)!);else element.removeAttribute(attr);
    }else if(rec.type==='characterData')target.textContent=rec.target.textContent;
    else if(rec.type==='childList'){
     for(const node of Array.from(rec.removedNodes)){const other=map.get(node);if(other?.parentNode===target)target.removeChild(other);forgetTree(node,map);}
     for(const node of Array.from(rec.addedNodes)){
      const copy=copyTree(node,map);
      const next=rec.nextSibling?map.get(rec.nextSibling):null;
      target.insertBefore(copy,next?.parentNode===target?next:null);
     }
    }
   }
  }
  state.records+=records.length;
 }
 return changed;
}
function disposeMirrors(){for(const state of mirrors)state.observer.disconnect();mirrors.length=0;}
export {initializeMirrors,syncMirrors,disposeMirrors};
