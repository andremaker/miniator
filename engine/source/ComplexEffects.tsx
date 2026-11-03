import React from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig,spring,interpolate} from 'remotion';
// Compound visual-damage fixture: small moving layers, nested filters,
// shadows, dynamically appearing children, translucent overlap, in-flow
// pseudo-content, and frame-dependent text. Original React remains authoritative.
export const Hello:React.FC=()=>{
  const f=useCurrentFrame();const {fps}=useVideoConfig();
  const eased=spring({frame:f,fps,config:{damping:17}});
  return <AbsoluteFill style={{backgroundColor:'#172032',color:'white',fontFamily:'Arial,sans-serif'}}>
    <style>{`.complex-before::before{content:'PREFIX ';color:#fcaf4e;font-weight:700}`}</style>
    <div style={{position:'absolute',left:245,top:148,width:220,height:150,opacity:interpolate(f,[0,12,75,89],[0.65,1,1,0.7],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),filter:'blur(1px) brightness(1.05)'}}>
      <div style={{position:'absolute',left:22+Math.sin(f/14)*20,top:10+Math.cos(f/13)*10,width:145,height:66,backgroundColor:'#d4567b',borderRadius:9,boxShadow:'0px 4px 9px rgba(0,0,0,0.3)',transform:`rotate(${Math.sin(f/21)*8}deg)`}} />
      <div className="complex-before" style={{position:'relative',top:96,left:10,width:176,height:36,fontSize:18,backgroundColor:'#235b80',padding:6,borderRadius:4}}>{Math.floor(f/6)}%</div>
      {f>=35&&f<70?<span style={{position:'absolute',top:38,left:135,background:'#52a783',padding:7,boxShadow:'0 4px 8px #0006',opacity:eased}}>ON</span>:null}
    </div>
  </AbsoluteFill>
};
