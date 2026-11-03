# Benchmark tools and fixtures

Miniator's seven built-in scenes live in `engine/source/`; composition metadata and reference details live in `engine/references/` and `engine/scene_fixture.json` after preparation. These are controlled **microbenchmarks** of rendering behaviors, not a representative catalog of complete production videos.

The benchmark directory contains an **external comparator adapter**, not a complete matched-run harness. `remotion-cli.js` invokes a locally installed Remotion CLI executable. It does not vendor source, prepare matching parameters for Miniator, calculate medians or validate visual equivalence.

```bash
npm run benchmark:remotion -- render <entry> <composition> <output> [Remotion CLI options]
```

Use the same source and visibly changing input parameters for both renderers; track one-off preparation separately from reusable template costs. Record current host limits, chosen planner/capture options, all individual durations, frame counts, image coverage and output fidelity. Interleave runs and avoid overlapping heavy processes. Store generated measurements and videos outside tracked source paths (`benchmarks/results/` is ignored).

See [benchmark methodology](../docs/benchmarking.md) for the comparison protocol and [optimization catalog](../docs/optimization-catalog.md) for recorded experiments and conditional techniques.
