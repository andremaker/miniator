import React from 'react';

/** A Miniator-native React composition, driven only by explicit frame props. */
export default function AnimatedTitle({frame, fps, width, height, title = 'Miniator'}) {
  const progress = Math.min(1, frame / (fps * 0.6));
  return (
    <main style={{width, height, background: '#141d2d', color: 'white',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <h1 style={{fontSize: 48, opacity: progress,
        transform: `translateY(${(1-progress)*32}px)`}}>{title}</h1>
    </main>
  );
}
