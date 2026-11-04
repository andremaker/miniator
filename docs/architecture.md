# Rendering architecture

Miniator is a CEF-only renderer. CEF is built and installed **outside the repository** and communicates with Miniator through the source-owned `cef/miniator_cef_bridge.cc` host and `cef/transport.js` JSON-lines transport. The bridge uses CEF `OnPaint` and explicit `SendExternalBeginFrame()` scheduling, not browser screenshot encoding.

## Pipeline

1. Prepare a React/HTML composition and its animation timeline using `engine/source/timeline.tsx` and `engine/timeline_math.js`.
2. Plan frame batches and choose full-frame or predicted ROI/packed capture for supported source geometry. Unpredictable visual effects fall back conservatively.
3. Render multiple frame slots per CEF tab. The process reuses CEF tabs across supported jobs.
4. Set a unique RGB correlation marker in a **reserved final viewport column** after the batch's DOM updates. The native bridge retries paints until it sees the expected marker at the bottom-right pixel. This avoids accepting stale `OnPaint` images. That column is excluded from all video tiles.
5. Copy the resulting uncompressed BGRA atlas into a POSIX shared-memory frame pool; the native Node-API addon extracts individual tiles or packed rectangles directly into buffers.
6. Feed raw BGRA to FFmpeg over stdin; conditional YUV-before-pad, ROI reconstruction, pipeline overlap and tail repetition reduce work when applicable.

No PNG/JPEG stage, intermediate image files, alternate browser runtime or foreign composition framework are used in the rendering path.

## Key source files

| Concern | Files |
| --- | --- |
| Native CEF host and scheduling | `cef/miniator_cef_bridge.cc`, `cef/transport.js` |
| Browser capture, atlas lifecycle, FFmpeg | `engine/plan_renderer.js` |
| Timeline and animation math | `engine/source/timeline.tsx`, `engine/timeline_math.js` |
| Scene preparation | `engine/prepare_compiled_scene.js` |
| Frame dependency compilation | `engine/dependency_transform.js`, `engine/build_static.js`, `engine/compiled_runtime.js` |
| Source-level geometry inference | `engine/runtime_math.js` |
| Memory/concurrency planning | `engine/atlas_capacity_planner.js`, `engine/predictive_atlas_plan.js` |
| Shared-memory BGRA extraction | `native/atlas_native.cc` |
| Process API | `src/index.js`, `bin/miniator.js` |

## Limitations

The public API includes isolated external React/TSX compilation and parameterized sessions with CEF tab reuse. Each independent one-off render uses a fresh worker. The existing planner shares the same native capture backend across the modes. The AST ROI predictor supports a defined subset of expressions rather than arbitrary CSS/JS. Scene-specific performance and visual fidelity require testing. An external benchmark runner is deliberately separate from this repository.

See [capabilities](capability-status.md), [development](development.md) and [benchmark methodology](benchmarking.md).
