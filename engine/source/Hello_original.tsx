import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/** Publicly documented 120-frame title/counter comparison composition. */
export const Hello: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rise = spring({frame, fps});
  const fade = interpolate(frame, [0, 20], [0, 1], {extrapolateRight: 'clamp'});
  const percent = interpolate(frame, [30, 90], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{backgroundColor: '#141414', color: 'white', justifyContent: 'center', alignItems: 'center'}}>
      <h1 style={{fontSize: 96, opacity: fade, transform: `translateY(${(1 - rise) * 60}px)`}}>Release 2.0</h1>
      <Sequence from={30} layout="none">
        <p style={{fontSize: 40}}>{Math.round(percent)}% faster builds</p>
      </Sequence>
    </AbsoluteFill>
  );
};
