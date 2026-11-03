import React from 'react';
import {AbsoluteFill,useCurrentFrame,interpolate} from 'remotion';
// Benchmark-only negative-space fixture: two independently animated,
// spatially separated visual groups, with filters, text, opacity and shadows.
export const Hello:React.FC=()=>{
  const f=useCurrentFrame();
  const left=interpolate(f,[0,89],[0,1]);
  return <AbsoluteFill style={{backgroundColor:'#172032',fontFamily:'Arial,sans-serif',color:'white'}}>
    <div style={{position:'absolute',left:65,top:151,width:145,height:138,filter:'blur(1px)',opacity:.85+left*.15}}>
      <div style={{position:'absolute',left:Math.sin(f/12)*15+10,top:10,width:99,height:68,
        backgroundColor:'#d4567b',borderRadius:8,boxShadow:'0px 5px 10px #0007',transform:`rotate(${f/6}deg)`}}/>
      <span style={{position:'absolute',top:95,left:12,fontSize:20,backgroundColor:'#235b80',padding:4}}>{Math.floor(f/3)}%</span>
    </div>
    <div style={{position:'absolute',left:768,top:153,width:150,height:138,filter:'blur(1.5px)',opacity:.9}}>
      <div style={{position:'absolute',left:15,top:12+Math.sin(f/10)*11,width:99,height:70,
        backgroundColor:'#43a783',borderRadius:13,boxShadow:'0px 4px 9px #0009',transform:`rotate(${-f/8}deg)`}}/>
      <span style={{position:'absolute',top:95,left:8,fontSize:20,backgroundColor:'#235b80',padding:4}}>{f%17}</span>
      {f>35&&f<70?<span style={{position:'absolute',left:105,top:55,fontSize:17}}>ON</span>:null}
    </div>
  </AbsoluteFill>;
};
