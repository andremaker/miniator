# Changelog

## Unreleased: CEF-only repository reconstruction

- Restore the project-owned CEF 154 native bridge and direct shared-memory BGRA atlas-to-FFmpeg transport.
- Reject stale `OnPaint` surfaces with a per-capture reserved-column correlation pixel.
- Remove all foreign composition framework imports and capture protocol calls, replacing timeline primitives with Miniator-owned implementations.
- Require the official CEF SDK as an external dependency, never tracked in Git.
- Restore Apache License 2.0 terms and strict clean-history source boundaries.
- Add native CEF screenshot and multi-tab correlated-frame video regression tests.

The native capture pipeline has passed isolated real CEF tests. Integrated React fixture rendering and performance comparisons still require full validation.
