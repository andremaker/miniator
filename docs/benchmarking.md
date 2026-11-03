# Benchmark methodology

This guide defines how to compare Miniator builds, optimization strategies, and the external Remotion renderer. **Historic minimum timings are not interchangeable with fresh same-host measurements.** Preserve failed as well as winning candidates.

## Workload and measurement boundaries

Use identical source, dimensions, frame rate, duration, and **visible parameter values** for both renderers. Keep the seven built-in microbenchmarks (`Hello_original`, `SimpleSequences`, `MovingTiles`, `ManyCards`, `GradientMotion`, `ComplexEffects`, `SeparatedEffects`) unchanged for regression tracking; add separate realistic compositions for broader representativeness.

Report these workloads separately:

| Workload | Timed costs |
| --- | --- |
| One-off | Scene-specific source compilation, planning, render/capture and encoding; exclude reusable framework bundling and process/browser warmup when genuinely universal. |
| Template preparation | Scene-specific compile/plan/validation once, reported separately. |
| First new parameters | Input-specific planning or fallback plus rendering/encoding. |
| Warm repeat | Same parameter values and valid prepared state; report cache usage. |
| Amortized template | `(template preparation + sum of N job costs) / N`, with N and input distribution stated. |

State precisely which browser startup, tab creation, bundle setup, DOM creation, and encoder startup costs were included. Do not mix render-only and end-to-end times in one ranking.

## Controlled performance comparisons

1. Verify the exact Git revisions, inputs and fixture SHA-256 hashes, optimization switches, Chromium and FFmpeg builds.
2. Measure host CPU quota, memory limit/pressure, `/dev/shm`, process count and availability of GPU devices. Never assume GPU acceleration.
3. Prewarm identical configurations, then interleave or randomize A/B runs. Do not compile, extract archives, or run heavy QA during timed experiments.
4. Tune tab counts and atlas geometry/slots under the same resource budget for each engine. Include 4-tab configurations where practical; avoid ranking fixed one-tab runs without tuning.
5. Record every repetition, median and spread by scene, with compilation/planning separate from frame production.
6. Verify expected frames/dimensions. For ROI or packed capture, specifically test **outside-region changed-pixel coverage**; SSIM alone can conceal missed pixels. Byte equality is a useful strict-mode signal, not a mandatory ROI-mode requirement.
7. Clean up browser processes and POSIX shared-memory pools after tests, including failures and timeouts.

Document enabled/disabled/conditional optimizations for each compared build. A planner improvement should be compared to the **same full-optimization baseline** before comparing to Remotion; do not silently drop pipeline overlap, static DOM, ROI, packed regions, tail repetition, or native capture.

## External comparator

`benchmarks/remotion-cli.js` forwards arguments to the locally installed Remotion **CLI**. The repository does not include the Remotion engine source or its generated bundles.

```bash
npm run benchmark:remotion -- render <entry> <composition> <output> [Remotion CLI options]
```

This command invokes Remotion; it does **not** automatically create matched inputs, run Miniator, or calculate comparative statistics. Use a separately controlled harness and keep generated outputs in ignored directories. Remotion packages are development dependencies, and some fixture adapters additionally use their installed APIs.

## Evidence policy

Store source hashes, settings, per-run timings, host metadata, output hashes/SSIM, frame coverage checks, and negative results together. The [optimization catalog](optimization-catalog.md) preserves candidate outcomes and hypotheses; the catalog is not itself an executable benchmark harness. Shared CI runners are useful for functional regression checks, **not** promotion decisions based on small timing differences.
