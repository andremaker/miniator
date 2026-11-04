# Public API

The current Miniator Node.js interface is a fixture-oriented process wrapper, not yet a multi-tenant render service.

```js
const {prepareScene,render}=require('miniator');
await prepareScene('SeparatedEffects');
const result=await render({
  cefBridgePath:'/absolute/path/to/external/cef-sdk/Release/miniator_cef_bridge',
  args:['--mode','chosen','--damage-crop','on','--tabs','4','--slots','8','--reps','1','--output','./results'],
});
console.log(result.code);
```

Set `CEF_ROOT` to the external SDK location to provide the matching runtime libraries. `cefBridgePath` sets only the native executable location. The optional `ffmpegPath` sets the external FFmpeg binary. `render()` accepts `signal`, `onStdout` and `onStderr` callbacks and resolves with `{code,stdout,stderr}` or rejects on failure.

`prepareScene(scene)` builds browser bundles for one of `Hello_original`, `SimpleSequences`, `MovingTiles`, `ManyCards`, `GradientMotion`, `ComplexEffects`, `SeparatedEffects`. `compileStatic(scene)` creates an experimental static dependency variant.

The renderer starts a new worker per public call and reuses tabs only within supported worker jobs. Shared generated fixture files cannot safely be modified by concurrent preparations. Automatic arbitrary-source ingestion and a persistent cross-call worker service are not part of this version.
