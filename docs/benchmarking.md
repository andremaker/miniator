# Benchmarking policy

Keep original scene source and parameter sets matched between Miniator and
Remotion. Disclose one-off compilation and template compilation separately;
measure first-new-parameter and warm-repeat calls, and amortized template costs.
Do not include browser startup/tab creation in steady-state timing.

Benchmark all seven existing scenes: Hello_original, SimpleSequences,
MovingTiles, ManyCards, GradientMotion, ComplexEffects, SeparatedEffects.
The latter two exercise partial/detached regions. ROI/packed capture must never
omit content outside predicted rectangles; small in-region differences are
allowed in ROI mode but should be measured. No unconditional optimization.

Performance metadata should include commit, resource limits, code and fixture
hashes, per-repetition timing, strategy and atlas schedule, SSIM/frame counts.
Keep losing candidates in the optimization catalog and never rank by historical
medians across different hosts.

This migration itself intentionally does not change optimization algorithms.
