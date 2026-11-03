# Miniator

**Miniator** is an experimental HTML/React-to-video rendering engine.
This repository contains the engine, its native extraction addon, tests, and benchmarks.

Miniator supports predictive atlas scheduling, conditional packed/ROI captures,
static-DOM compilation, frame repetition, persistent multi-tab Chromium workers
within a job, direct POSIX shared-memory BGRA capture, native tile extraction,
and FFmpeg encoding. See [architecture](docs/architecture.md) and
[capability status](docs/capability-status.md) for exact coverage.

## Requirements

- Linux x86-64, Node.js 22+, C++17 compiler and Node-API headers.
- `ffmpeg` with `libx264` (or `MINIATOR_FFMPEG` set to a compatible executable).
- **A compatible patched Chromium build supporting `Page.remotionCreateFramePool`
  and POSIX shared-memory capture**. Set `MINIATOR_BROWSER=/absolute/path/to/chrome-headless-shell`.
- Browser and native addon are not distributed as committed binaries. No PNG/JPEG
  files are used in the capture path; frame buffers use shared memory.

## Get started

```bash
npm ci
npm run build:native
export MINIATOR_BROWSER=/path/to/compatible/chrome-headless-shell
npm run doctor
npm test
npx miniator prepare Hello_original
npx miniator render --mode chosen --reps 1 --output ./run-output
```

The repository carries the existing precompiled scene bundles to preserve
reference behavior. `miniator prepare` regenerates bundles for the selected
fixture, updating scene-specific manifests; commit intentional source changes
separately from regeneration.

The public Node API (`require('miniator').render(...)`) is an **experimental
subprocess adapter**. It currently launches one worker per call and does not
keep Chromium alive across independent calls. Within a renderer job, Miniator
reuses browser tabs as supported by the original runner. See [API](docs/api.md).

## Benchmark and fidelity policy

The seven retained microbenchmarks are fixtures, not a claim of representative
real-world Remotion workloads. Historical timings are not directly comparable
between hosts. All performance decisions need current interleaved runs,
matching source, props, encoder settings and fidelity.

`npm run smoke` requires the patched browser; `npm test` uses offline video QA and does not.
More: [reproduction](docs/development.md), [benchmarks](docs/benchmarking.md).

## Scope and current limitations

- The original core remains in `engine/` to avoid changing hot-path behavior
  during Git migration. Module extraction is a separate validated task.
- The template source compiler only covers a bounded React subset.
- The strategy registry contains source/input-specific validated records; these
  are not universal geometry proofs.
- The modified Chromium build must be acquired separately, respecting its license.
- The first repository release is an experimental development snapshot, not a
  production-ready standalone service.

## Licensing

No public license is selected. See [LICENSE.md](LICENSE.md).
