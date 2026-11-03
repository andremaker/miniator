// Scene-neutral JSX-to-DOM executor. Compiles React/TSX source to JavaScript
// using esbuild and tracks the scene's VDOM using small, explicit DOM patches.
// This supports the current five-scene compatibility corpus without delegating
// any per-frame work to React reconciler. CSS variable mode is optional.
'use strict';
let frame=0;
const W=globalThis;
const conf=W.__MINIATOR_PLAN__;
if(!conf?.capture||!conf?.composition)throw Error('Missing render configuration');
const {width,height,fps,durationInFrames}=conf.composition;
const {x,y,width:tileWidth,height:tileHeight}=conf.capture;
const slots=conf.execution.slots,columns=conf.execution.columns||slots;
const mode=W.__MINIATOR_COMPILED_STYLE_MODE__||'direct';
W.__MINIATOR_VIDEO_CONFIG__={width,height,fps,durationInFrames};
const absStyle={position:'absolute',top:0,left:0,right:0,bottom:0,width:'100%',height:'100%',display:'flex',flexDirection:'column'};
const unitless=new Set(['animationIterationCount','aspectRatio','borderImageOutset','borderImageSlice','borderImageWidth','boxFlex','boxFlexGroup','boxOrdinalGroup','columnCount','columns','flex','flexGrow','flexPositive','flexShrink','flexNegative','flexOrder','gridArea','gridRow','gridRowEnd','gridRowSpan','gridRowStart','gridColumn','gridColumnEnd','gridColumnSpan','gridColumnStart','fontWeight','lineClamp','lineHeight','opacity','order','orphans','scale','tabSize','widows','zIndex','zoom','fillOpacity','floodOpacity','stopOpacity','strokeDasharray','strokeDashoffset','strokeMiterlimit','strokeOpacity','strokeWidth']);
const normalizeStyle=(k,v)=>v==null||v===''?'':(typeof v==='number'&&v!==0&&!unitless.has(k)?`${v}px`:String(v));
function jsx(type,props,...children){return {type,props:{...(props||{}),...children.length?{children:children.length===1?children[0]:children}:{}}};}
W.__miniatorJsx=jsx;
W.__miniatorFragment=({children})=>children;
function resolve(node){
 if(node==null||node===false||node===true)return null;
 if(Array.isArray(node))return node.flatMap(n=>{const q=resolve(n);return q==null?[]:Array.isArray(q)?q:[q]});
 if(typeof node==='string'||typeof node==='number')return {tag:'#text',text:String(node)};
 if(typeof node!=='object'||!node.type)throw Error('Invalid scene node '+String(node));
 const {type,props}=node;
 if(typeof type==='function'){
  if(type.__miniatorComponent==='AbsoluteFill'){
   return resolve(jsx('div',{...props,style:{...absStyle,...(props.style||{})}}));
  }
  if(type.__miniatorComponent==='Sequence'){
   const from=props.from||0,duration=props.durationInFrames??Infinity;
   if(frame<from||frame>=from+duration)return null;
   if(props.layout==='none')return resolve(props.children);
   return resolve(jsx('div',{style:{...absStyle,flexDirection:undefined},children:props.children}));
  }
  return resolve(type(props));
 }
 const raw=resolve(props.children);
 return {tag:type,props:{...props,children:undefined},children:raw==null?[]:Array.isArray(raw)?raw:[raw]};
}
function patchStyles(el,newStyle,oldStyle={},state){
 const keys=new Set([...Object.keys(oldStyle||{}),...Object.keys(newStyle||{})]);
 for(const k of keys){let val=normalizeStyle(k,(newStyle||{})[k]);
  if(val===normalizeStyle(k,(oldStyle||{})[k]))continue;
  if(mode==='css'&&(k==='opacity'||(k==='transform'&&W.__MINIATOR_STYLE_SAFE_TRANSFORM__))&&typeof (newStyle||{})[k]!=='undefined'){
    const prop='--miniator-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
    if(!state.cssProps.has(k)){el.style[k]=`var(${prop})`;state.cssProps.add(k);}
    el.style.setProperty(prop,val);
  }else{el.style[k]=val;}
 }
}
function patchProps(el,next={},old={},state){
 if(next.style||old.style)patchStyles(el,next.style||{},old.style||{},state);
 for(const k of new Set([...Object.keys(next),...Object.keys(old)])){
  if(k==='children'||k==='key'||k==='ref'||k==='style')continue;
  if(next[k]===old[k])continue;
  if(k==='className')el.className=next[k]||'';
  else if(k.startsWith('on'))throw Error('Unsupported event handler needs original React semantics: '+k);
  else if(next[k]==null||next[k]===false)el.removeAttribute(k);
  else el.setAttribute(k,String(next[k]));
 }
}
function instantiate(v){
 const el=v.tag==='#text'?document.createTextNode(v.text):document.createElement(v.tag);
 const s={el,v,children:[],cssProps:new Set()};
 if(v.tag!=='#text'){
   patchProps(el,v.props||{}, {},s);
   for(const child of v.children){const x=instantiate(child);el.appendChild(x.el);s.children.push(x);}
 }
 return s;
}
function update(s,v){
 if(!s||s.v.tag!==v.tag){const repl=instantiate(v);if(s?.el?.parentNode)s.el.replaceWith(repl.el);return repl;}
 if(v.tag==='#text'){
   if(s.v.text!==v.text)s.el.nodeValue=v.text;
 }else{
   patchProps(s.el,v.props||{},s.v.props||{},s);
   // Stable structure normally patches in place; insert/remove handles Sequence.
   const prev=s.children,news=v.children||[],upt=[];
   for(let i=0;i<news.length;i++){
     const n=news[i];
     if(i>=prev.length){const a=instantiate(n);s.el.appendChild(a.el);upt.push(a);}
     else{const old=prev[i],a=update(old,n);if(a.el!==old.el||s.el.childNodes[i]!==a.el)s.el.insertBefore(a.el,s.el.childNodes[i]||null);upt.push(a);}
   }
   for(let i=prev.length-1;i>=news.length;i--)prev[i].el.remove();
   s.children=upt;
 }
 s.v=v;return s;
}
const root=document.getElementById('app');
function bootstrap(Component){
 const states=[];
 const layout=[];
 for(let i=0;i<slots;i++){
  const outer=document.createElement('div');
  outer.style.cssText=`position:absolute;left:${(i%columns)*tileWidth}px;top:${Math.floor(i/columns)*tileHeight}px;width:${tileWidth}px;height:${tileHeight}px;overflow:hidden`;
  const inner=document.createElement('div');
  inner.style.cssText=`position:absolute;left:${-x}px;top:${-y}px;width:${width}px;height:${height}px`;
  outer.appendChild(inner);root.appendChild(outer);layout.push(inner);states.push(null);
 }
 function drawFrames(frames){
  for(let i=0;i<slots;i++){
   frame=frames[i];W.__MINIATOR_FRAME__=frame;
   const v=resolve(jsx(Component,{}));
   if(!states[i]){states[i]=instantiate(v);layout[i].appendChild(states[i].el);}
   else states[i]=update(states[i],v);
  }
 }
 drawFrames(Array(slots).fill(0));
 W.drawBatch=async(start,total,requestedSlots)=>{
  if(total!==durationInFrames||requestedSlots!==slots)throw Error('Invalid timeline');
  const frames=Array.from({length:slots},(_,i)=>Math.min(durationInFrames-1,start+i));
  drawFrames(frames);return frames;
 };
 W.remotionAtlasReady=async()=>{await document.fonts.ready;return true;};
 W.__MINIATOR_COMPILER_INFO__={engine:'generic-jsx-to-dom',perFrameReactReconciliation:false,mode,slots};
}
exports.bootstrap=bootstrap;
