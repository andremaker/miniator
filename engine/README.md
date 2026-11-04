# Miniator engine

`plan_renderer.js` orchestrates source plans, CEF tabs, multi-frame atlases, native raw BGRA capture, tile extraction and direct FFmpeg encoding. It is the full renderer, not a substitute prototype.

`prepare_compiled_scene.js` builds a fixed test corpus. `source/timeline.tsx` and `timeline_math.js` provide native Miniator timeline primitives. `build_static.js` and `dependency_transform.js` optionally reduce per-frame reconciliation; `runtime_math.js` infers supported ROI candidates. `atlas_capacity_planner.js` and `predictive_atlas_plan.js` calculate candidate capture layouts and pre-render batch schedules.

CEF is external to this repository; the source-owned bridge and its build system reside in `../cef/`. The video path is raw BGRA with no intermediate image compression. Capture correlation uses a reserved marker column outside the atlas tiles. See `../docs/architecture.md` and `../docs/development.md`.
