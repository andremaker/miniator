# Architecture

Miniator retains the original implementation in `engine/`, rather than doing
a wholesale rewrite to match a desired directory tree.

## Frame pipeline

1. TSX scene source and parameter-dependent plans are compiled or selected.
2. Atlas planner predicts capture batches before rendering. Parameter-invariant
   template plans are reusable; dependent plans are recalculated before render.
3. Persistent Chromium workers keep multiple tabs/frame slots warm during jobs.
4. Patched Chrome captures raw BGRA to a POSIX shared-memory frame pool.
5. Native Node-API addon extracts atlas tiles, ROI or packed regions.
6. Frames are fed directly to FFmpeg, with YUV conversion before padding where
   the selected plan allows it, and frame repetition/overlap when valid.

## Boundaries

- `engine/plan_renderer.js`: existing orchestration, browser/CDP, capture, FFmpeg
- `engine/predictive_atlas_plan.js`: pre-render predictive batch scheduling
- `engine/atlas_capacity_planner.js`: host capacity and complexity estimates
- `engine/dependency_transform.js`: compiler AST dependency analysis
- `engine/static_runtime.js`: compiled static DOM runtime
- `native/atlas_native.cc`: POSIX shared-memory extraction (Node-API)
- `src/index.js`: minimal external subprocess interface

Do not refactor `engine/plan_renderer.js` merely to relocate files. First add a
matchable performance/fidelity baseline, then move one boundary at a time.
