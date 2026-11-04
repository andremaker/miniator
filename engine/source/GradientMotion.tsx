import React from 'react';
import {AbsoluteFill, useCurrentFrame} from './timeline';
/** Locally authored negative control: moving full-frame gradient, translucency, blur. */
export const Hello:React.FC=()=>{
 const f=useCurrentFrame();const x=f*1.7;
 return <AbsoluteFill style={{background:`linear-gradient(${(f*1.3)%360}deg,#064672,#6435a8,#ef3075)`,overflow:'hidden'}}>
   {Array.from({length:7},(_,i)=> <div key={i} style={{position:'absolute',left:`${i*16+Math.sin(f/13+i)*9}%`,top:`${12+i*10+Math.cos(f/10+i)*7}%`,
    width:180,height:120,borderRadius:35,background:'rgba(255,255,255,0.35)',filter:`blur(${3+i}px)`,transform:`rotate(${x+i*17}deg)`}}/>)}
   <h1 style={{position:'absolute',left:70,bottom:36,color:'white',fontSize:54,fontFamily:'Arial',textShadow:'0 3px 14px #333'}}>Scene {f}</h1>
 </AbsoluteFill>;
};
