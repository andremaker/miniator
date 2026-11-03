# Miniator

Miniator is an experimental **HTML/React-to-video rendering engine** for browser-based compositions. It reduces frame-generation overhead by planning animation updates and capture regions, combining multiple frames into browser atlases, transferring raw pixels through POSIX shared memory, and encoding with FFmpeg.

The project targets Linux development and performance research. Its current command line and Node.js API operate on **seven included composition fixtures**; it does **not** yet provide a stable API for rendering arbitrary user-supplied TSX, managing many isolated jobs, or loading media-heavy productions. A compatible patched Chromium build is required and is not distributed here.

## Rendering pipeline

```text
TSX composition + render parameters
             |
  source analysis and strategy selection
             |
  frame/region predictions (before drawing)
             |
  multiple Chromium tabs and frame atlases
             |
  patched Chromium -> POSIX SHM (raw BGRA)
             |
  native C++ atlas/ROI tile extraction
             |
   FFmpeg reconstruction and encoding
             |
            MP4
```

Miniator's strategies can be combined where their assumptions hold:

- **Predictive atlases:** estimate capture geometry, complexity, batch size, and memory cost before frame execution. The current integrated estimator uses a constant complexity factor across a scene; automatic per-frame expression inference is incomplete.
- **ROI and packed regions:** capture a small changing rectangle or multiple noncontiguous regions rather than empty space between animations; fall back to full-frame capture when a region plan is unsuitable.
- **Static DOM updates:** compile a supported subset of frame-dependent TSX expressions into property/text updates without per-frame React reconciliation.
- **Selective reuse:** warm tabs within a render process, conditional repeated-frame encoding, scene-specific plan reuse, and overlapping capture/encode stages where enabled.

These are conditional capabilities, **not blanket performance guarantees**. See [architecture](docs/architecture.md), [supported capabilities](docs/capability-status.md), and the [optimization catalog](docs/optimization-catalog.md).

## Requirements

| Component | Requirement |
| --- | --- |
| Platform | Linux x86-64 with POSIX shared memory |
| Node.js | 22+ and Node-API headers |
| Compiler | C++17 compiler (`g++` by default) |
| Browser | Compatible patched Chromium with `Page.remotionCreateFramePool` support |
| Video tools | FFmpeg with `libx264`, plus `ffprobe` for verification |

Set `MINIATOR_BROWSER` to the patched browser executable. `MINIATOR_FFMPEG` optionally selects a specific encoder executable. A stock Chromium executable does not implement the capture protocol used by this engine. The project neither downloads nor vendors the patched browser.

Browser atlases and raw BGRA buffers can use substantial memory and `/dev/shm`. The engine is not yet hardened for untrusted input or multi-tenant workloads.

## Quick start

```bash
npm ci
npm run build
export MINIATOR_BROWSER=/absolute/path/to/compatible/chrome-headless-shell
npm run doctor
npm test
npm run smoke
```

`npm run build` compiles `engine/atlas_native.node` from the C++ source and generates browser bundles for the default `SeparatedEffects` fixture. `npm run doctor` checks local prerequisites; it checks the browser version command, **not** compatibility of every capture method. `npm run smoke` performs a real render, so the patched browser and FFmpeg must be available.

To prepare and render another included scene:

```bash
node bin/miniator.js prepare Hello_original
node bin/miniator.js render --mode chosen --reps 1 --output ./render-output
```

Run `node bin/miniator.js help` for commands. `prepare` changes the active fixture and regenerates local bundles; **do not prepare different fixtures concurrently in one checkout**. Render output and generated bundles are ignored by Git. The output directory holds the chosen-mode MP4 and timing summary.

## Node.js interface (experimental)

```js
const {prepareScene, render} = require('./src');

await prepareScene('SeparatedEffects');
const result = await render({
  browserPath: '/absolute/path/to/compatible/chrome-headless-shell',
  args: ['--mode', 'chosen', '--reps', '1', '--output', './render-output'],
});
console.log(result.code, result.stdout);
```

Each `render()` call starts a new renderer subprocess. Tabs are kept warm **within that process**, not across separate calls to the public adapter. The scene preparation operation writes shared generated state. See [API and CLI](docs/api.md) for supported arguments, error handling, and current limitations.

## Repository map

| Location | Purpose |
| --- | --- |
| `engine/plan_renderer.js` | Browser control, atlas capture, FFmpeg, and strategy execution |
| `engine/predictive_atlas_plan.js` | Batch scheduling and template-plan caching logic |
| `engine/atlas_capacity_planner.js` | Source/geometry estimates and host-memory-aware candidate selection |
| `engine/dependency_transform.js`, `engine/static_runtime.js` | Bounded static-DOM compilation and execution |
| `engine/source/`, `engine/references/` | Seven composition fixtures and their metadata |
| `native/atlas_native.cc` | POSIX shared-memory and raw BGRA extraction addon |
| `src/`, `bin/` | Node.js process adapter and command-line interface |
| `tests/` | Unit, integration, and offline fidelity checks |
| `benchmarks/` | External rendering comparison adapter and guidance |
| `docs/` | Architecture, development, benchmarks, capabilities, research catalog |

## Verification and performance

```bash
npm run check     # syntax/manifests, namespace, third-party source boundary
npm test          # unit, lightweight integration, offline reference checks
npm run smoke     # end-to-end render; requires patched Chromium
```

The seven fixtures exercise titles, sequences, tiles, cards, gradients, effects and disjoint changing regions. They are **targeted microbenchmarks**, not representative production video projects. Remotion is an external benchmark/reference dependency; some included compatibility fixtures still call its installed APIs at build time. No Remotion source or generated vendor bundle is tracked. See [benchmark methodology](docs/benchmarking.md).

## Project maturity

Miniator has working native atlas capture and validated paths on the included fixtures. Important gaps include arbitrary scene loading, safe fallback coverage for general React behavior, a long-lived public worker API, robust job cancellation/isolation, browser provisioning, media/audio/WebGL support, and broader visual QA. See the [capability matrix](docs/capability-status.md) before choosing a production use case.

For contributors: [development guide](docs/development.md). For implementation: [architecture](docs/architecture.md). For research results and unsuccessful techniques: [optimization catalog](docs/optimization-catalog.md).

## License

Miniator is licensed under the Apache License, Version 2.0.

See [LICENSE.md](LICENSE.md) for the full license terms.
