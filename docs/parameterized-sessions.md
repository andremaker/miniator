# Parameterized rendering sessions

A compiled external React/TSX composition can render several sets of JSON
parameters through the **same** CEF browser process, tab pool, React roots, atlas
frame pools, native BGRA capture path, and FFmpeg encoding pipeline.

## API

```js
const {compileComposition} = require('miniator');
const template = await compileComposition({
  source: './my-scene.tsx', width: 640, height: 360, fps: 30,
  durationInFrames: 60,
});
const session = template.createSession({tabs: 2, slots: 4});
try {
  await session.ready;
  await session.render({output: 'a.mp4', props: {title: 'A'}});
  await session.render({output: 'b.mp4', props: {title: 'B'}});
  await session.render({output: 'a-again.mp4', props: {title: 'A'}});
} finally {
  await session.close();
  template.close();
}
```

`compileComposition()` bundles the source once into a temporary, isolated
workspace. `createSession()` starts the CEF bridge once. The first render allocates
tabs and native frame pools; later renders update props in the existing React
root **before** frame computation or capture. The renderer still uses the
existing shared-memory atlas extraction and FFmpeg pipeline. It never reads
rendered pixels to determine how to update props.

`render()` is sequential per session. Concurrent calls are queued by the
worker's request loop. Each render returns `tabs_setup`, `reused_tabs`,
`props_updated`, `total_s`, `hash`, and the same general render diagnostics as
single-use Miniator output. Changing parameters does **not** bypass real
rendering: every output receives its own frame captures and encoding.

A compiled composition cannot be closed while its sessions remain active.
Always close sessions explicitly, particularly for long-lived services.

## Supported semantics and limitations

- Scene source must accept deterministic `frame`, `timeInSeconds`,
  `durationInFrames`, dimensions, FPS and JSON user props. Any parameters
  changing layout, text, or animation are reflected in subsequent renders.
- React reconciliation and DOM root reuse are supported; arbitrary component
  state, network side effects, media streams and external mutable state are **not**
  guaranteed to reset between jobs. Use the one-off path for such compositions.
- Dynamic props conservatively retain **full-frame** capture until the input
  dependency and predicted region planner has established safe ROI/packing.
  This does not disable the native shared-memory/multi-tab atlas pathway.
  The native CEF bridge implements Miniator's frame-pool command interface.
- A session handles one compiled composition. Multiple different compositions
  require distinct sessions, and there is not yet a shared multi-composition
  worker pool.


## Native capture and verification

Sessions use the same CEF native bridge and marker-correlated POSIX shared-memory capture as one-off renders. CEF is an external dependency, configured through `CEF_ROOT` or `MINIATOR_CEF_BRIDGE`.

The public parameterized React path still needs full end-to-end validation with installed React/esbuild dependencies. Historical measurements from a different browser backend are not applicable to this build.
