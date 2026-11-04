import {spring,interpolate} from './timeline_math.js';
export {spring,interpolate};
export function useCurrentFrame(){return globalThis.__MINIATOR_FRAME__}
export function useVideoConfig(){return globalThis.__MINIATOR_VIDEO_CONFIG__}
export function AbsoluteFill(){throw Error('AbsoluteFill marker must be resolved by compiler')}
AbsoluteFill.__miniatorComponent='AbsoluteFill';
export function Sequence(){throw Error('Sequence marker must be resolved by compiler')}
Sequence.__miniatorComponent='Sequence';
