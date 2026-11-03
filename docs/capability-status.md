# Capability and support matrix

This matrix records the **current implementation boundary**, not a roadmap disguised as supported functionality. A successful fixture benchmark does not imply arbitrary React or media support.

| Capability | Status | Scope and conditions |
| --- | --- | --- |
| Multi-tab frame atlases | Implemented | Renderer-managed concurrency; tab reuse is within a worker process. |
| Direct BGRA shared-memory capture | Implemented | Requires compatible patched Chromium and Linux POSIX SHM. |
| Native atlas tile extraction | Implemented | Builds from `native/atlas_native.cc`; platform-specific binary generated locally. |
| Full-frame rendering | Available | Conservative fallback for unsupported ROI plans; still constrained by fixture adapter coverage. |
| Single ROI / packed disjoint regions | Conditional | Source/input-matched geometry and reconstruction assumptions must hold. |
| Static dependency compiler | Limited | Validated on five fixtures; does not cover arbitrary hooks, effects, portals or stateful JS. |
| Repeated trailing frames | Conditional | Requires a valid equality instruction for the active scene and parameters. |
| Predictive capacity estimator | Experimental | Uses geometry, scene-level complexity heuristics and memory budget; not a performance oracle. |
| Pre-render variable-batch scheduler | Implemented, opt-in | `--predictive-atlas on`; current runner supplies constant complexity descriptors across frames. |
| Template-plan dependency cache | Library capability | Supports declared dependencies; no automatic general TSX dependency certification or external reusable-template API. |
| Public CLI and Node.js API | Experimental | Seven prepared fixtures; subprocess per render call, no stable general source API. |
| Long-lived multi-job browser service | Not implemented | Independent `render()` calls do not share the browser. |
| General image/video/audio inputs | Not established | Benchmark fixtures do not test production media loading/mixing. |
| SVG/Canvas/WebGL and arbitrary React parity | Not established | No comprehensive compatibility corpus. |
| Production isolation/cancellation | Not established | Shared generated fixture state and subprocess cleanup need hardening. |

## Build and runtime dependencies

The rendering path needs patched Chromium, Linux native build support and FFmpeg. The repository includes **source** for native extraction but no prebuilt addon or browser. The benchmark competitor is Remotion, used via an installed CLI. Some included fixtures use installed Remotion APIs, including internal APIs, so the fixture pipeline is not fully framework-independent at build time.

## Validation boundary

Unit tests exercise planner logic, lightweight integration tests cover CLI/native exports, and offline fidelity tests use stored references. `npm run smoke` is the browser-backed check, requiring the patched browser. Tests currently do not establish general source loading, multi-user isolation, long-run memory safety or performance across realistic video projects. See [benchmarking](benchmarking.md) for valid comparison procedure and [API](api.md) for current callable functionality.
