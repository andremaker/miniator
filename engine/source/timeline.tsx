import React, {createContext, useContext} from 'react';
import {interpolate,spring} from '../timeline_math';
export {interpolate,spring};
const FrameContext=createContext<number|null>(null);
const VideoContext=createContext<any>(null);
export function MiniatorFrameProvider({frame,config,children}:{frame:number,config:any,children:React.ReactNode}){
  return <VideoContext.Provider value={config}><FrameContext.Provider value={frame}>{children}</FrameContext.Provider></VideoContext.Provider>;
}
export function useCurrentFrame(){const value=useContext(FrameContext);if(value===null)throw Error('Timeline provider missing');return value;}
export function useVideoConfig(){const value=useContext(VideoContext);if(!value)throw Error('Video configuration missing');return value;}
export const AbsoluteFill=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({style,...props},ref)=><div {...props} ref={ref} style={{position:'absolute',top:0,left:0,right:0,bottom:0,width:'100%',height:'100%',display:'flex',flexDirection:'column',...style}}/>);
export function Sequence({from=0,durationInFrames=Infinity,layout='absolute-fill',children}:{from?:number,durationInFrames?:number,layout?:string,children?:React.ReactNode}){
 const current=useCurrentFrame();
 if(current<from || current>=from+durationInFrames)return null;
 const element=<FrameContext.Provider value={current-from}>{children}</FrameContext.Provider>;
 return layout==='none'?element:<AbsoluteFill>{element}</AbsoluteFill>;
}
