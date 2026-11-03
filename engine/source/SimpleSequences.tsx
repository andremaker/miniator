import React from 'react';
import {AbsoluteFill,Sequence,useCurrentFrame,interpolate} from 'remotion';
/** Locally authored corpus scene: sequence boundaries, full-frame color changes, numeric text. */
export const Hello:React.FC=()=>{
 const frame=useCurrentFrame();
 const colors=['#2563eb','#eb2556','#ebcd25'];
 return <AbsoluteFill style={{backgroundColor:colors[Math.min(2,Math.floor(frame/30))],fontFamily:'Arial',justifyContent:'center',alignItems:'center',color:'white'}}>
  <Sequence from={0} durationInFrames={30}><h1 style={{fontSize:82}}>Sequence 1</h1></Sequence>
  <Sequence from={30} durationInFrames={30}><h1 style={{fontSize:82}}>Sequence 2</h1></Sequence>
  <Sequence from={60} durationInFrames={30}><h1 style={{fontSize:82}}>Sequence 3</h1></Sequence>
 </AbsoluteFill>;
};
