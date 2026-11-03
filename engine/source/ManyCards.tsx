import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate} from 'remotion';
/** Locally authored corpus scene, NOT copied from a published benchmark. */
export const Hello:React.FC=()=>{
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 return <AbsoluteFill style={{backgroundColor:'#101827',color:'#fff',fontFamily:'Arial,sans-serif',padding:30,
    display:'grid',gridTemplateColumns:'repeat(4,1fr)',gridTemplateRows:'repeat(3,1fr)',gap:12}}>
   {Array.from({length:12},(_,i)=>{
     const arrival=spring({frame:frame-i*3,fps,config:{damping:14}});
     const n=Math.round(interpolate(frame,[i*3,80+i],[0,100+i],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}));
     const color=`hsl(${i*29},70%,42%)`;
     return <div key={i} style={{backgroundColor:color,borderRadius:14,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
       transform:`translateY(${(1-arrival)*85}px)`,opacity:Math.max(0,Math.min(1,arrival)),boxShadow:'0 7px 16px rgba(0,0,0,0.35)'}}>
       <strong style={{fontSize:26}}>Metric {i+1}</strong><span style={{fontSize:40}}>{n}%</span>
     </div>
   })}
 </AbsoluteFill>;
};
