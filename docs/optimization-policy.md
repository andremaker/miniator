# Automatic optimization policy

Miniator separates **capability approval** from **render applicability**. The
former is a release-level engineering decision. The latter belongs to the
planner and is evaluated for the composition and current parameter values.

## Approved capabilities

Production `chosen`, `external`, and `external-session` rendering uses
`--optimization-policy auto` by default. Approved capabilities include ROI,
packed regions, static DOM compilation where the compiler supports the scene,
predicted identical trailing frames, predictive atlas batching, persistent tabs,
shared-memory BGRA capture, native frame extraction, and compatible capture /
encoding pipeline overlap. Early FFmpeg startup and chroma-aligned YUV-before-
padding are also available automatically. Each is conditional on the inputs
needed for the strategy, not on the existence of a previous QA record.

The existing source/input-specific strategy registry is **reuse and calibration
metadata**, not a global list of scenes that may be optimized. Valid planner
predictions take priority over it. The geometry and repetition instructions in
that registry can still be reused for exactly matching inputs.

Other techniques, notably layer caching and experimental visual cache modes,
remain opt-in. Auto does **not** force every technique onto every render.
An unsupported prediction falls back to full frame without disabling unrelated
transport, batching, encoding, or tab reuse facilities. A malformed repetition
instruction does not disable valid ROI capture.

## Predictions before rendering

An immutable composition fixture may contain `optimization_predictions`:

```json
{
  "source_sha256": "<hash of the exact composition source>",
  "parameterInvariant": true,
  "plan": {
    "background": "141414",
    "capture": {"x": 100, "y": 80, "width": 280, "height": 220},
    "repetition": {"type": "identical-trailing-frames", "start": 60, "clones": 29}
  }
}
```

For parameter-dependent geometry, replace `parameterInvariant` and `plan`
with `parameterDependencies` (a list of parameter keys) and `byDependencyHash`
(a mapping from SHA-256 of the JSON serialization of relevant parameter values
to a predicted plan). This permits input-scoped preplanning and reuse without
inspecting output images or requiring a previous exact-output QA result.

**Current limitation:** The external composition compiler does not yet infer
this contract automatically for arbitrary React/TSX. Unsupported arbitrary
composition geometry falls back to full-frame capture. The interface is the
integration point for future source/parameter analysis, not a claim that all
arbitrary compositions now receive ROI or repetition.

## Allocation and performance

Batch packing is decided before frame capture. The generic atlas predictor
can generate capacity candidates, but it has not proved that its top candidate
outperforms a measured configuration. It therefore **does not overwrite**
validated tab/slot selections by default; `--experimental-predictive-concurrency`
explicitly exercises that research behavior. Predictive batching itself remains
automatic for production modes.

All benchmark and experimental modes preserve their explicit tuning flags. To
turn off scene-specific planning use `--optimization-policy off`. Individual
transport flags such as `--pipeline off` or `--predictive-atlas off` remain
available. Any production default or heuristic change requires measured
baseline comparisons, frame-count checks, and visual QA before promotion.
