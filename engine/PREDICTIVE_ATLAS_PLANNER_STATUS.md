# Predictive atlas packing: implementation status

## Implemented and unit-tested

`predictive_atlas_plan.js` computes frame costs and packs consecutive frame regions into batches using predicted region area, complexity, memory/surface-copy budget, atlas dimensions, max slots, and capture overhead. It works without running Chromium, building a DOM, reading capture pixels, or accessing output videos.

`compileTemplateAtlas()` accepts a compiled frame-descriptor plan. If the compiler certifies that geometry/complexity have no parameter dependencies, it packs every frame during template compilation and reuses the plan for all inputs. For declared dependencies, it evaluates frame descriptors and packs them only when those input values change, reusing a dependency-keyed cache otherwise. Irrelevant props do not invalidate it.

Test result: PASS, 120 invariant frames -> 4 batches (largest 30), and dynamic inputs replan only for changed relevant dependencies. No rendering/benchmark was performed for this module.

## Not yet integrated or validated

- This is a standalone planning module. The production renderer still uses fixed-size per-tab atlas slots and has not been changed to consume variable-sized batch plans.
- The compiler does not currently generate certified frame descriptor functions or parameter-dependency metadata. The test supplies these explicitly.
- Predicted costs are heuristic. Calibration against identical warm renderer configurations remains necessary; no performance or visual-quality improvement is established yet.
- Per-frame region geometry must be safely predicted from source/parameters. Where that cannot be done, retain full-frame fallback and do not claim multi-ROI coverage.
- Atlas plans must remain instruction-only and must not store rendered frame pixels.

## Suggested safe integration

1. Extend static compiler/source analysis to emit frame descriptors plus parameter dependencies; mark unknown dependencies as runtime-unsafe for preplanning.
2. Compile an immutable atlas schedule once when dependencies are empty; otherwise evaluate descriptor expressions for only relevant changed parameters before DOM updates.
3. Update runtime to consume batch descriptors and support different atlas occupancy without extra framebuffer reads, ideally reusing a small number of preallocated geometry classes.
4. Isolate changes to the approved baseline behind a feature flag; compare under identical prewarmed tab/encoder settings, with all seven scenes and parameter sets; verify outside-region coverage.
5. Promote only measured wins; retain failures/losing strategies in the optimization catalog.
