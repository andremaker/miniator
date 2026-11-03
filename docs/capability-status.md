# Capability status and caveats

| Capability | Current status |
|---|---|
| Multi-tab atlas | Retained, pre-existing |
| Direct Chromium POSIX BGRA | Retained, patched-browser dependency |
| Native atlas extraction | Source recovered; reproducibly built on Linux |
| ROI and packed-region capture | Available, selected conditionally |
| Static DOM compiler | Bounded fixture coverage; fallback required |
| Tail-frame repetition | Conditional and only where proved valid |
| Predictive batch packing | Integrated, not fully universal per-frame cost model |
| Parameter-reusable planning | Planner supports it; full independent service API pending |
| Cross-job persistent Chromium via public API | Not implemented |
| Media/audio/WebGL feature parity with Remotion | Not established |
| Complete real-world benchmark validation | Not established |

Historical benchmark evidence is kept independently from this migration.
The original renamed Miniator source archive is the baseline; no optimization
should be removed just because one fixture does not benefit.

## External Remotion dependency boundary

The source repository does not vendor Remotion library implementation or browser bundles. The legacy React fixture path currently imports **Remotion APIs including `Internals`** through an installed development dependency. That is an API integration, not copied source code, but it means the compatibility runner is not yet independently executable without Remotion packages at scene-build time. Removing that runtime API coupling while preserving source fidelity is future work; do not describe the engine as completely Remotion-independent yet. The comparator itself is CLI-only under `benchmarks/`.
