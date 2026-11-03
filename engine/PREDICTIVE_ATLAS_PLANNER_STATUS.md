# Predictive atlas planner: implementation status

The planner estimates frame batching **before DOM frame updates or screenshot capture**, using source/plan-provided rectangles, paint-complexity estimates and atlas memory limits. It is intentionally separate from pixel-based validation and historical performance calibration.

## Pure planning module

`predictive_atlas_plan.js` exports `normalizedFrame`, `estimateAtlas`, `packPredictedFrames`, and `compileTemplateAtlas`. The scheduler can accept **different predicted regions and complexity per frame** and groups consecutive frames until the predicted cost/geometry/memory threshold is reached. It does not call Chromium or read rendered outputs.

`compileTemplateAtlas({sourceHash, frameDescriptors, parameterDependencies, config})`:

- Compiles an immutable schedule once when no parameters can change the descriptors.
- For declared dependencies, calculates a new schedule for relevant input values **before rendering**, with dependency-keyed caching; irrelevant props do not invalidate it.
- Requires trustworthy descriptor declarations. The API cannot prove an arbitrary JS/React scene has invariant geometry by itself.

## Current renderer integration

`plan_renderer.js` imports `compileTemplateAtlas` and can consume the generated batch schedule from the capture loop when launched with `--predictive-atlas on`. The `chosen` mode can use the capacity model in `atlas_capacity_planner.js` to select tab and slot candidates under current memory constraints. This **is a real integration**, not merely a standalone planner test.

The integrated descriptors currently repeat a **constant scene-level complexity and region layout** across frames. The compiler does not automatically infer individual per-frame complexity, parameter dependencies or geometric changes for general sources. The integrated template cache is scoped to the worker process and its current immutable source/configuration; it does not establish an external multi-job template service. The flag is opt-in, and source/input-matched retained configurations remain available as fallbacks.

## Quality and performance limits

Predicted cost is a heuristic, not an empirical guarantee of the fastest atlas size. Memory model assumptions about browser surface copies must be checked against actual host limits. A predicted packed layout is usable only when changing content is covered; use full-frame fallback where correctness cannot be established. Prior controlled tests found that predictive scheduling helps some fixtures and loses on others; keep both outcomes in the [optimization catalog](../docs/optimization-catalog.md).

## Validation

```bash
node --test tests/unit/predictive.test.js
node --test tests/unit/capacity.test.js
```

Run the commands from the repository root. They test the planner and estimator, **not** an end-to-end rendered output. To test integration, prepare a fixture and run the selected renderer with `--predictive-atlas on`, then verify frame counts and visual coverage. An end-to-end performance win must be demonstrated against the same renderer with predictive planning disabled under matched conditions.
