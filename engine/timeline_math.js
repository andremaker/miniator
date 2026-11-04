'use strict';
// Miniator's own deterministic timeline mathematics. No external animation runtime.
function interpolate(value, inputs, outputs, options={}) {
  if(!Array.isArray(inputs)||inputs.length<2||inputs.length!==outputs.length)throw Error('Invalid interpolation ranges');
  for(let i=1;i<inputs.length;i++)if(!(inputs[i]>inputs[i-1]))throw Error('Input range must be strictly increasing');
  const left=value<inputs[0], right=value>inputs[inputs.length-1];
  const behavior=left?(options.extrapolateLeft||options.extrapolate||'extend'):right?(options.extrapolateRight||options.extrapolate||'extend'):null;
  if(behavior==='identity')return value;
  if(behavior==='clamp')value=Math.max(inputs[0],Math.min(inputs[inputs.length-1],value));
  const j=value<=inputs[0]?0:value>=inputs[inputs.length-1]?inputs.length-2:inputs.findIndex((x,i)=>i< inputs.length-1 && value>=x && value<=inputs[i+1]);
  const t=(value-inputs[j])/(inputs[j+1]-inputs[j]);
  const easing=options.easing|| (x=>x);
  return outputs[j]+(outputs[j+1]-outputs[j])*easing(t);
}
function spring({frame,fps,config={},from=0,to=1,durationInFrames}={}) {
  if(!Number.isFinite(frame)||!Number.isFinite(fps)||fps<=0)throw Error('Invalid spring timeline');
  const stiffness=config.stiffness??100, damping=config.damping??10, mass=config.mass??1, velocity=config.velocity??0;
  if(!(stiffness>0&&mass>0&&damping>=0))throw Error('Invalid spring parameters');
  let t=Math.max(0,frame)/fps;
  if(durationInFrames!==undefined){const scaled=Math.max(0,frame)/durationInFrames;t=scaled;}
  const w0=Math.sqrt(stiffness/mass), z=damping/(2*Math.sqrt(stiffness*mass));
  let x;
  if(z<1){const wd=w0*Math.sqrt(1-z*z);x=Math.exp(-z*w0*t)*(Math.cos(wd*t)+(z*w0-velocity)/wd*Math.sin(wd*t));}
  else if(z===1){x=Math.exp(-w0*t)*(1+(w0-velocity)*t);}
  else {const s=Math.sqrt(z*z-1), a=-w0*(z-s), b=-w0*(z+s);
    const c=(-velocity-b)/(a-b);x=c*Math.exp(a*t)+(1-c)*Math.exp(b*t);}
  const result=from+(to-from)*(1-x);
  return config.overshootClamping?Math.max(Math.min(from,to),Math.min(Math.max(from,to),result)):result;
}
module.exports={interpolate,spring};
