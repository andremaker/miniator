import React from 'react';
import {AbsoluteFill,useCurrentFrame} from './timeline';
/** Locally authored corpus scene: moving opaque elements on invariant background. */
export const Hello:React.FC=()=>{
 const frame=useCurrentFrame();
 return <AbsoluteFill style={{backgroundColor:'#191919',fontFamily:'Arial',color:'#fff'}}>
  {Array.from({length:16},(_,i)=> <div key={i} style={{position:'absolute',width:88,height:78,
    left:25+(i%4)*230,top:50+Math.floor(i/4)*115,
    transform:`translate(${(frame*3+i*17)%220}px,${(frame*2+i*13)%35}px)`,
    backgroundColor:`hsl(${(i*21)%360} 70% 45%)`,borderRadius:4}}/>)}
 </AbsoluteFill>;
};
