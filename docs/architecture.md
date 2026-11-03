# Rendering architecture

This document describes the current Miniator rendering components and their data flow. The renderer is implemented largely in `engine/plan_renderer.js`; the boundaries below are functional responsibilities, not a claim that every subsystem is already an independent module.

## Execution flow

1. **Input selection:** a prepared TSX scene, `scene_fixture.json`, and optional RenderPlan/strategy registry describe the composition and supported strategies.
2. **Planning:** the strategy selector determines whether full-frame, ROI, packed-region, repetition, and static-DOM execution are usable for this source/input configuration. The atlas-capacity model predicts candidate concurrency and memory use.
3. **Pre-render atlas allocation:** when `--predictive-atlas on` is enabled, `predictive_atlas_plan.js` constructs a frame-to-batch schedule **before DOM frame updates**. Predicted capture geometry and complexity must come from safe source/plan assumptions, not pixels read after rendering.
4. **Browser execution:** multiple tabs run in a compatible patched Chromium through CDP. Slots represent frames in a browser atlas; the renderer can reuse allocated tabs within the process.
5. **Pixel transfer:** patched Chromium writes BGRA to a POSIX shared-memory frame pool. The C++ Node-API addon `atlas_native.node` maps the pool and extracts tiles or packed regions.
6. **Video encoding:** FFmpeg consumes raw frames and reconstructs omitted regions when the plan permits. Tail-frame repetition and pipeline overlap are conditional.

## Implementation map

| Component | Main files | Responsibility |
| --- | --- | --- |
| Orchestrator | `engine/plan_renderer.js` | Chrome lifecycle/CDP, capture batches, native addon calls, FFmpeg, timing and selected-mode dispatch |
| Capacity model | `engine/atlas_capacity_planner.js` | Memory-based tab/slot candidates, coarse scene complexity, atlas geometry |
| Batch scheduler | `engine/predictive_atlas_plan.js` | Cost estimation for predicted frames, variable batch occupancy, cache for parameter-dependent plan descriptors |
| Static compiler | `engine/dependency_transform.js`, `engine/build_static.js` | Bounded TSX dataflow analysis and updater generation |
| DOM runtime | `engine/static_runtime.js`, `engine/source/` | Browser-side scene installation and frame updates |
| Native pixels | `native/atlas_native.cc`, `native/binding.gyp` | POSIX SHM mapping and atlas frame extraction |
| Public wrapper | `src/index.js`, `bin/miniator.js` | Fixture preparation and subprocess execution |

## Planning and validity boundaries

The scheduler supports distinct predicted costs per frame **as a library API**. The integrated renderer currently supplies a scene-level complexity estimate for every frame, not automatically derived per-frame complexity expressions. `compileTemplateAtlas()` can cache invariant plans and key dependent plans by declared parameter dependencies, but the compiler does not yet automatically emit validated parameter-dependency descriptors for arbitrary TSX.

The predictive execution path is **opt-in** with `--predictive-atlas on`; the guarded strategy registry may otherwise choose retained fixed-size configurations. Full-frame capture is an important fallback when the geometry prediction is unsupported. Packed regions must cover each changing island, not merely their bounding rectangle; verifying missed pixels remains separate from accepting small differences inside the captured area.

## External dependencies and operational constraints

The patched Chromium exposes a custom frame-pool CDP interface; stock Chromium does not satisfy this requirement. The native addon requires Linux/POSIX shared memory. Atlas size, tab concurrency, frame-pool surface copies, memory use, and FFmpeg work can interact strongly under load. The public API currently starts a fresh worker process per render call.

The source fixtures still use installed Remotion APIs for compatibility, including internal context APIs in some adapters. This is a portability limitation; the Remotion renderer itself is an external benchmark opponent, not a bundled engine implementation.

For supported behaviors see [capability status](capability-status.md). For changing code safely see [development](development.md).
