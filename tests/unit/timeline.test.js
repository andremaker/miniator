const test=require('node:test');
const assert=require('node:assert/strict');
const {spring,interpolate}=require('../../engine/timeline_math');
test('interpolate clamps and extends deterministically',()=>{
 assert.equal(interpolate(5,[0,10],[0,100]),50);
 assert.equal(interpolate(25,[0,10],[0,100],{extrapolateRight:'clamp'}),100);
 assert.equal(interpolate(-2,[0,10],[0,100],{extrapolateLeft:'clamp'}),0);
 assert.equal(interpolate(-2,[0,10],[0,100]),-20);
});
test('spring is finite, starts at origin and is stable for identical frames',()=>{
 const values=Array.from({length:120},(_,frame)=>spring({frame,fps:30}));
 assert.equal(values[0],0);
 assert.ok(values.every(Number.isFinite));
 assert.equal(spring({frame:10,fps:30}),values[10]);
 assert.ok(Math.abs(values.at(-1)-1)<0.01);
});
