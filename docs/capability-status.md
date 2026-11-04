# Capability status

| Capability | Present status |
| --- | --- |
| CEF `OnPaint` offscreen capture | Native bridge builds and real capture test passes with CEF 154 |
| Correlated on-demand frame capture | 1-pixel reserved-column nonce; 48-frame, 4-tab stress/fidelity smoke passes |
| POSIX BGRA shared memory and native atlas extraction | Verified against native CEF SDK; no image compression |
| Direct FFmpeg raw BGRA | Verified 48-frame MP4 output, correct frame count and per-frame BGRA pixel checks |
| Multi-tab atlas execution | 4 tabs × 4 slots passed isolated video transport test |
| Source-level ROI prediction | Implemented for a constrained AST/DOM subset, conservative fallback |
| Packed disjoint regions, YUV reconstruction | Source path retained; full integrated CEF fixture regression pending |
| Static dependency compiler | Source path retained; full integrated CEF fixture regression pending |
| Pipeline overlap, early encoder, trailing repetition | Source paths retained; fresh whole-render CEF benchmarks pending |
| General source/props API and persistent cross-call worker | Not part of current fixture-oriented public adapter |
| Arbitrary React/media/CSS parity | Not established |

**Validation boundary:** A successful native video transport test establishes correct CEF capture, shared-memory transfer, tile extraction, timing correlation, and raw FFmpeg encoding for the tested geometry. It does **not** establish complete React fixture equivalence, arbitrary media support, or a benchmark ranking. Those require dependencies and separate matched-scene testing.

The official CEF SDK must be supplied independently. No CEF SDK headers, executables, libraries or resources belong to the source repository.
