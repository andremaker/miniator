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
