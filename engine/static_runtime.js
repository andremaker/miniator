'use strict';
// One-time DOM construction + per-frame leaf update callbacks.
// No component rerun, no JSX re-evaluation, no VDOM diff or React reconciliation.
const W=globalThis,conf=W.__MINIATOR_PLAN__;
if(!conf?.capture||!conf.composition)throw Error('Missing plan');
const {width,height,fps,durationInFrames}=conf.composition;
const {x,y,width:tileWidth,height:tileHeight}=conf.capture;
const slots=conf.execution.slots,cols=conf.execution.columns||slots;
const mode=W.__MINIATOR_COMPILED_STYLE_MODE__||'direct';
W.__MINIATOR_VIDEO_CONFIG__={width,height,fps,durationInFrames};
W.__miniatorDynamic=fn=>({__miniatorDynamic:fn});
W.__miniatorMemoFrame=fn=>{let last=NaN,result;return ()=>{if(last!==W.__MINIATOR_FRAME__){result=fn();last=W.__MINIATOR_FRAME__;}return result;};};
W.__miniatorFragment=({children})=>children;
W.__miniatorJsx=(type,props,...children)=>({type,props:{...(props||{}),...(children.length?{children:children.length===1?children[0]:children}:{})}});
const absStyle={position:'absolute',top:0,left:0,right:0,bottom:0,width:'100%',height:'100%',display:'flex',flexDirection:'column'};
const unitless=new Set(['animationIterationCount','aspectRatio','borderImageOutset','borderImageSlice','borderImageWidth','boxFlex','boxFlexGroup','boxOrdinalGroup','columnCount','columns','flex','flexGrow','flexPositive','flexShrink','flexNegative','flexOrder','gridArea','gridRow','gridRowEnd','gridRowSpan','gridRowStart','gridColumn','gridColumnEnd','gridColumnSpan','gridColumnStart','fontWeight','lineClamp','lineHeight','opacity','order','orphans','scale','tabSize','widows','zIndex','zoom','fillOpacity','floodOpacity','stopOpacity','strokeDasharray','strokeDashoffset','strokeMiterlimit','strokeOpacity','strokeWidth']);
const norm=(k,v)=>v==null||v===''?'':typeof v==='number'&&v!==0&&!unitless.has(k)?`${v}px`:String(v);
const isDyn=v=>!!v&&typeof v==='object'&&typeof v.__miniatorDynamic==='function';
function makeUpdater(ctx,fn,apply){
 let prev,first=true;
 function update(){const val=fn(),v=val==null?'':val;if(first||v!==prev){apply(v);prev=v;first=false;ctx.stats.writes++;}}
 ctx.steps.push(update);update();
}
function setStyle(el,k,val,ctx){
 const cssVar=mode==='css'&&(k==='opacity'||(k==='transform'&&W.__MINIATOR_STYLE_SAFE_TRANSFORM__));
 if(cssVar&&val!==''){
   const name='--miniator-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
   el.style[k]=`var(${name})`;el.style.setProperty(name,val);
 }else el.style[k]=val;
}
function initProps(el,props,ctx){
 for(const [k,raw] of Object.entries(props||{})){
  if(k==='children'||k==='key'||k==='ref')continue;
  if(k.startsWith('on'))throw Error('Event handler not supported by static executor '+k);
  if(k==='style'){
   for(const [field,val] of Object.entries(raw||{})){
    if(isDyn(val)){ctx.stats.dynamicStyleFields++;makeUpdater(ctx,val.__miniatorDynamic,v=>setStyle(el,field,norm(field,v),ctx));}
    else setStyle(el,field,norm(field,val),ctx);
   }
  }else {
   const apply=v=>{if(k==='className')el.className=v;else if(v===''||v===false)el.removeAttribute(k);else el.setAttribute(k,String(v));};
   if(isDyn(raw)){ctx.stats.dynamicAttributes++;makeUpdater(ctx,raw.__miniatorDynamic,apply);}else apply(raw);
  }
 }
}
function mount(parent,v,ctx,before=null){
 if(v===null||v===undefined||v===true||v===false)return;
 if(Array.isArray(v)){for(const item of v)mount(parent,item,ctx,before);return;}
 if(isDyn(v)){
  const n=document.createTextNode('');parent.insertBefore(n,before);
  ctx.stats.dynamicTextNodes++;
  makeUpdater(ctx,v.__miniatorDynamic,value=>{n.nodeValue=String(value)});return;
 }
 if(typeof v==='number'||typeof v==='string'){
  parent.insertBefore(document.createTextNode(String(v)),before);return;
 }
 if(!v||typeof v!=='object'||!v.type)throw Error('Invalid static JSX value '+String(v));
 const {type,props}=v;
 if(typeof type==='function'){
  if(type.__miniatorComponent==='AbsoluteFill'){
   mount(parent,{type:'div',props:{...props,style:{...absStyle,...(props.style||{})}}},ctx,before);return;
  }
  if(type.__miniatorComponent==='Sequence'){
   const marker=document.createComment('sequence');parent.insertBefore(marker,before);
   const holder=document.createDocumentFragment();
   if(props.layout==='none')mount(holder,props.children,ctx);
   else mount(holder,{type:'div',props:{style:{...absStyle,flexDirection:undefined},children:props.children}},ctx);
   // Collect direct child nodes once. Keeping these nodes detached during off phase
   // avoids any per-frame JSX execution, and preserves exact layout when mounted.
   const nodes=Array.from(holder.childNodes);
   let shown=false;
   const from=props.from||0,dur=props.durationInFrames??Infinity;
   const flip=()=>{
    const visible=W.__MINIATOR_FRAME__>=from&&W.__MINIATOR_FRAME__<from+dur;
    if(visible===shown)return;
    if(visible){for(const n of nodes)parent.insertBefore(n,marker)}
    else for(const n of nodes)holder.appendChild(n);
    shown=visible;ctx.stats.sequenceToggles++;
   };
   ctx.switches.push(flip);flip();return;
  }
  mount(parent,type(props),ctx,before);return;
 }
 const el=document.createElement(type);initProps(el,props,ctx);
 parent.insertBefore(el,before);mount(el,props?.children,ctx);
}
function bootstrap(Component){
 const root=document.getElementById('app');const workers=[];
 const stats={componentCalls:0,drawCalls:0,updateCalls:0,writes:0,dynamicStyleFields:0,dynamicTextNodes:0,dynamicAttributes:0,sequenceToggles:0};
 for(let i=0;i<slots;i++){
  const outer=document.createElement('div');outer.style.cssText=`position:absolute;left:${(i%cols)*tileWidth}px;top:${Math.floor(i/cols)*tileHeight}px;width:${tileWidth}px;height:${tileHeight}px;overflow:hidden`;
  const inner=document.createElement('div');inner.style.cssText=`position:absolute;left:${-x}px;top:${-y}px;width:${width}px;height:${height}px`;
  outer.appendChild(inner);root.appendChild(outer);
  W.__MINIATOR_FRAME__=0;
  const ctx={steps:[],switches:[],stats};
  const tree=Component({});stats.componentCalls++;
  mount(inner,tree,ctx);workers.push(ctx);
 }
 const drawFrames=frames=>{
  stats.drawCalls++;
  for(let i=0;i<slots;i++){
   W.__MINIATOR_FRAME__=frames[i];const c=workers[i];
   for(const update of c.steps){update();stats.updateCalls++;}
   for(const flip of c.switches)flip();
  }
 };
 W.drawBatch=async(start,total,requestedSlots)=>{
  if(total!==durationInFrames||requestedSlots!==slots)throw Error('Timeline mismatch');
  const frames=Array.from({length:slots},(_,i)=>Math.min(durationInFrames-1,start+i));
  drawFrames(frames);return frames;
 };
 W.miniatorAtlasReady=async()=>{await document.fonts.ready;return true};
 W.__MINIATOR_COMPILER_INFO__={engine:'static-dependency',mode,slots,stats};
}
exports.bootstrap=bootstrap;
