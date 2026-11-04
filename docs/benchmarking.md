# Benchmark methodology

An external competitor may be measured separately, using its complete standard rendering system. Miniator does not integrate or vendor any comparator code or CLI. Independent benchmarks must use identical source, scene parameters, FPS, resolution, duration, encoder settings and hardware budget.

## Required controls

1. Verify source hashes, CEF SDK version, FFmpeg version and all optimization flags.
2. Prewarm CEF processes/tabs and the other engine's equivalent runtime. Do not include universal browser startup in steady-state rendering timings.
3. Tune concurrency and atlas slots under the same CPU/memory budget; include Miniator's validated four-tab configuration.
4. Alternate and repeat matched trials. Report median, spread, and stalls; retain unsuccessful experiments.
5. Charge scene compilation and input-specific planning separately. Also report one-off and reusable-template scenarios.
6. Check decoded frame count, dimensions, source-to-video output coverage, and outside-ROI changes. Pixel-exact checks are optional for declared perceptual ROI mode but **missed changes outside the ROI are not acceptable**.
7. Record the complete set of enabled and disabled optimizations and compare against the fully optimized Miniator baseline before publishing competitive claims.

The [optimization catalog](optimization-catalog.md) stores scene-dependent opportunities and historical evidence. Historical timings are not comparable to fresh same-host trials without equivalent conditions.
