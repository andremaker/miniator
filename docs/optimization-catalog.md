# Miniator renderer: scene-aware optimization catalog

> **Evidence scope:** Entries record experiments, possible optimizations, failures, and unpromoted candidates. Referenced dated archives and reports are research provenance; they are not necessarily shipped or runnable in this repository. Measurements should not be treated as current-host performance. Exact input hashes and a fresh benchmark are required before promotion.

**Purpose:** Preserve every promising scene-dependent optimization for future cross-scene experiments. A slow, neutral, or incorrect result on the Remotion `Hello.tsx` fixture is **not** grounds for deleting an idea. Record evidence, failure modes, and potential workloads; retest on different scenes. This is an experimental registry, **not** a list of production-safe features.

**Historical canonical fixture:** unchanged Remotion `Hello.tsx`, 1920x1080, 30 FPS, 120 frames; reference MP4 SHA-256 `5d4b9f82ed55a830346bec21748a0a0804f63c0aba843b5db4f90a5546a4c78b`. Keep scene text and animation behavior unchanged when comparing renderer variants. Within-engine ablations do not require rerunning Remotion; full cross-renderer comparisons do.

**Architecture:** a versioned, persistent RenderPlan should primarily contain *instructions and proofs*, not frozen frames or copied DOM states. A job evaluates its current inputs. Optional materialized assets can be a separate, clearly labeled cache mode, never the default or the definition of a pre-optimized render. Any scene-code/dependency change invalidates the plan for now. Different input values must be either inside the plan's proven validity domain or trigger re-analysis/fallback.

**Workload routing (primary distinction):**

- **Precompiled optimization** is principally for **reusable template scenes with sufficiently bounded behavior**. Miniator can afford thorough analysis once per scene/code version, save a durable instruction-based RenderPlan, and reuse that plan when rendering many instances with supported variable inputs. Animation behavior, layout constraints, and input-dependent invalidation must be captured in the plan. A plan is not a frozen set of output frames.
- **Runtime optimization** is principally for **single-use scenes or highly free-form/unpredictable scenes**, including scenes whose permitted inputs or JavaScript/DOM behavior make a useful, trustworthy reusable RenderPlan impractical. Miniator analyzes the *actual instance* cheaply and selects safe optimizations during that render. It should not require full-timeline precompilation for an ordinary one-off job.
- **Hybrid** is appropriate when some reusable structural facts can be compiled but varying runtime content still needs inexpensive inspection or decision-making (e.g., checking dynamic text bounds, resource pressure, or whether a particular layer can be reused). It may also provide a fallback for template instances outside a saved plan's validity domain.
- **Neither / experimental** covers optimizations that do not pay back their overhead for the target workload, cannot yet preserve fidelity, or lack enough evidence. Preserve them for different scenes; do not delete unsuccessful ideas.

**Classify by workload suitability first, then by economic benefit.** A technique might be precompile-beneficial for templates yet runtime-unhelpful for one-off scenes. Conversely, a runtime technique may be valuable precisely because the scene cannot be preplanned. These are *workload modes*, not mutually exclusive families of rendering operations.

**Legend (per-technique capabilities rather than mandatory workload classification):**

- **P**: can be prepared or proved offline and embedded as *instructions* in a reusable scene-version plan.
- **R**: can be discovered or adapted safely and cheaply for the current render, even without a reusable plan.
- **P+R**: may be compiled for bounded templates or selected at runtime for one-off/unpredictable scenes; test costs separately.
- **Research**: needs implementation, fidelity proof, or broader evidence before classification.
- **Retain**: never equate 'not faster on Hello' with 'never useful'.

## Candidate registry

| ID | Optimization idea | Analysis / plan contents | Runtime action | Likely classification | Important scenes to revisit |
| --- | --- | --- | --- | --- | --- |
| ROI-01 | Conservative dynamic-region discovery | Safe changing screen-space rectangles; effect padding; dependencies | Capture only changing regions, reconstruct omitted pixels | P+R; runtime if cheap bounds are available | Large static canvases, slides, dashboards, mixed text |
| ROI-02 | Multiple noncontiguous ROIs | Rectangle union, atlas packing, overlap/compositing order | Capture several small islands instead of one bounding rectangle | P+R | Scattered moving icons, counters in corners |
| ROI-03 | Adaptive ROI/atlas geometry | Predicted bounds and expected bandwidth per scene phase | Resize and repack atlases across batches when worth the overhead | P+R / Research | Sparse bursts, long multi-phase animations |
| BG-01 | Uniform static background reconstruction | Prove color and safe compositing | FFmpeg pad/color background outside ROI | P+R | Title cards, solid-color marketing templates |
| BG-02 | Nonuniform static background/layer reuse | Cached background dependency graph and validity | Reconstruct with image/layers, preserving pixel-exact order | P+R | Product photo, static illustrations, gradients |
| DOM-01 | Factor static DOM/React subtrees | Dependency graph and safe static/dynamic partition | Reuse DOM nodes/layers instead of whole component subtrees | P+R | Deep complex React trees, many slots |
| DOM-02 | Minimal dynamic property updates | Identify frame-dependent props, styles and text nodes | Update affected properties without reconciling whole tree | P+R | Large mostly-static UIs with animated counters |
| LYR-01 | Reuse settled visual regions external to atlas | Stability interval; crop/band geometry; dependencies | Capture settled layer once per video and omit from later atlas screenshots | P+R | Scene with static title plus moving lower content |
| LYR-02 | Translation-only element/layer reuse | Appearance identity vs position; transform and sampling semantics | Capture once then compose at per-frame position | P+R / Research | Moving logos, captions, UI panels |
| LYR-03 | Transformed appearance reuse | Stable appearance, transform matrix, opacity, clipping | Apply affine/3D/opacity in compositor instead of rerasterizing | Research | Animating image cards, perspective motion |
| LYR-04 | Per-element periodic animation phase reuse | Proven appearance cycle / phase identity | Reuse a small cycle, allowing independent movement | P+R / Research | Rotating spinners, looped sprites, blinking icons |
| LYR-05 | Reuse identical assets across different DOM nodes | Raster/style/size/scale/alpha identity keys | Share rasterized appearance among multiple instances | P+R | Repeating icons, grids, lists |
| LYR-06 | Partial-layer invalidation | Fine-grained dependencies and dirty-region graph | Repaint only changed sublayers | P+R | Dashboards, nested layouts, dynamic labels |
| REP-01 | Identical full-frame intervals (not only tail) | Provable equality intervals; independent of varying inputs or guarded | Encode one source frame plus cloned frames with correct timestamps | P+R | Hold animations, title cards, stepwise slides |
| REP-02 | Repeated *partial* regions across different frames | Region/element equality and overlap proof | Cache/composite partial region while other regions animate | P+R | Looped decorations under moving text |
| REP-03 | Predictable non-consecutive frame/phase repetition | Deterministic symbolic timeline and state identity | Revisit cached phase at nonadjacent timestamps | P+R / Research | Looping keyframe animations |
| TAB-01 | Persistent initialized Chromium tabs | Worker/cache policy, size, template compatibility | Reuse contexts/tabs rather than recreating per job | R | Most repeated renders, short videos especially |
| TAB-02 | Adaptive number of tabs × slots | Workload-specific profiling/prediction, quotas | Select parallelism and atlas slot count | R or P+R | CPU-bound effects, different core counts |
| ATL-01 | Compact atlas and packing layout | Tile dimensions and safe clipping/compositing | Pack slots to reduce capture area and CDP overhead | P+R | Small dynamic content, irregular ROI shapes |
| CAP-01 | Patched Chromium shared-memory capture | Browser compatibility and pool-capacity settings | CDP frame pool and shared-memory extraction | R (mostly scene-independent) | Most scenes with expensive PNG screenshot transfer |
| CAP-02 | Native tile extraction / BGRA pipe | Pixel format/stride contract, bounded buffers | No PNG/Pillow; pack only ROI tiles to FFmpeg | R (mostly scene-independent) | High-res video, bandwidth-bound captures |
| ENC-01 | FFmpeg-side padding/compositing | Validated background/compositing strategy | Avoid full-frame copy; send compact BGRA to FFmpeg | P+R | Solid backgrounds, small ROI |
| PIPE-01 | Overlap capture, SHM extraction, and encoding | Stage profiling and queue/memory limits | Pipeline batches with safe frame-pool lifetime | R | Capture/encode latency can overlap |
| SYNC-01 | Minimize explicit rAF waits using valid capture barrier | Browser-paint synchronization proof | Avoid unnecessary waits without stale frames | R / Research | Many short batches |
| CACHE-01 | Optional reusable pre-rendered *scene-invariant* visuals | Immutable-content fingerprint, size/DPR/fonts | Share bitmaps across template runs | P+R optional | Logos, fixed artwork; **not** variable title/photos |
| CACHE-02 | Optional per-job cached *instance-invariant* visuals | Per-input materialization key and invalidation | Render once per job, reuse across timeline | P+R optional | Customized text/image that does not animate in appearance |

Scene-specific hypotheses should also cover **alternative pixel compositing backends** (Chromium's own compositor, GPU/Skia, FFmpeg filters, native CPU paths), provided their sampling, antialiasing, alpha and color-space behavior can match exact reference bytes. Previous browser-side sprites and `will-change` compositor-layer hints were **not pixel-identical** in the Hello tests; keep them as **research candidates**, not validated production paths.

## Existing observations: do not overgeneralize

These are historical results, **not** a new cross-scene benchmark and **not** an independent marginal-cost decomposition:

- A plan-derived ROI for Hello used `(730,438)` with `458x240`, while the solid background was `#141414`. Neither value belongs in generic engine source.
- The current compiled plan (2026-11-01) reports approximately **6.05 s** of full-timeline scan, **4.86 s** of layer-stability discovery, **12.62 s** of aggregate analysis, and **13.41 s** for compilation plus validation. These measurements share work, so do **not** sum or assign the entire scan to every technique independently.
- Seven-run *reused-tab* ablation with plan-derived repetition and no FFmpeg pipeline: `optimized` median **0.6509 s**; `optimizedNoRepeat` **0.6878 s**; external upper-layer reuse `layer` **0.6793 s**; generic DOM factoring `factor` **0.6909 s**; combined `factorLayer` **0.6470 s**. All finished outputs matched the reference SHA-256. The layer and factoring variants did not individually win here; **retain them**.
- A separate seven-run pipeline comparison: `optimized` **0.6417 s**, `layer` **0.6237 s**, `factor` **0.6676 s**, `factorLayer` **0.6505 s**. Changing execution environment and scheduling changes the relative rankings. Preserve both results instead of selecting a favorable suite.
- Reused tabs typically avoided about **80–130 ms** of new-tab setup per job in these runs. Benefit is clear for short repeated renders; still benchmark pool contamination, memory growth and concurrency.
- Earlier browser-side cached bitmap and compositor-hint experiments were not pixel exact. This is a fidelity failure for that implementation, **not** evidence that external element reuse or Chromium-equivalent compositing is impossible.
- Tightening capture area and FFmpeg-side padding showed large improvements versus full-frame copies, but different harnesses and atlas counts can confound direct ratios.
- Additional optimization ideas from earlier iterations: dense atlas layouts vs horizontal strips, dynamic masks/alpha-aware regions, dynamic frame batching/queue limits, resource-aware x264 thread count, cheaper sync, compile analysis only once per scene version.

## Required experiment protocol for each candidate

1. **Scene fingerprint and inputs:** use unchanged reference source for a within-scene A/B. For variable-template cases, use explicit input parameters. Invalidate plans if scene source or rendering dependencies change. Test at least one changed input value within a supported plan domain.
2. **Analyze separately:** log discovery/compile time; marginal cost when sharing a common analysis pass; validation time; serialized RenderPlan size and asset bytes; cache invalidation/fallback.
3. **Render separately:** log warm-tab setup, scene initialization, draw/capture, SHM extraction, compositing, FFmpeg and finalization. The final end-to-end wall time must include all *runtime* costs, not omit per-job setup.
4. **Correctness:** same-encoder output MP4 SHA-256 must match the trusted baseline for deterministic test fixtures. A hash mismatch needs pixel-level diagnosis or conservative fallback. Avoid routine intermediate pixel checks when the full MP4 hash already matches.
5. **Controlled comparisons:** same Chromium/FFmpeg/settings, reused vs new-tab results separated, randomized/alternating order, warmups, 7+ runs for serious candidates, individual timings plus median/spread. Track CPU quota, RSS, cache hits, GPU presence.
6. **Workload-specific economics:** For single-use or too-unpredictable scenes, measure `A_runtime + R_optimized < R_baseline` **on that same job**. For sufficiently bounded reusable templates, measure `A_precompile + V + N*R_optimized < N*R_baseline` while accounting for validity checks, input variation, invalidation frequency, and plan loading (V is precompile validation work not already counted in A). Consider **hybrid** when `A_precompile + V + N*(A_instance + R_optimized) < N*R_baseline`. Do not describe a technique as a viable runtime optimization if it only pays off after reusable plan compilation, nor reject a runtime technique solely because it cannot produce a stable reusable plan.
7. **Output:** record **scene/workload eligibility** (`one-off`, `unpredictable/free-form`, `bounded template`, `hybrid`) independently of empirical outcome (`runtime-beneficial`, `precompile-beneficial`, `conditional`, `not-beneficial-on-tested-scenes`, or `unsafe/needs-work`). An optimization can have more than one viable mode. **Never delete an idea** solely for losing on one scene. Record tested scenes, confidence and suspected break-even conditions.

## Cross-scene corpus to build

| Scenario | What it stress-tests | Inputs to vary |
| --- | --- | --- |
| S01: Original unchanged `Hello.tsx` | Stable title, counter, tail repetition, sparse ROI | Keep original as canonical reference; add *separate* parameterized variant for varied title length |
| S02: Static product/photo with animated labels | Photo/image background, changed text bounds, per-job input cache | Different photo sizes/aspect ratios, labels/fonts |
| S03: Many repeated icons/logos | Same appearance used many times; DOM factoring | Counts, sizes, positions, density |
| S04: Many moving but visually static objects | Translation-only reuse and affine compositor | Integer/subpixel offsets, speeds, rotations |
| S05: Independent periodic animations | Per-element phases vs no repeated whole frames | Period combinations, offsets, overlap |
| S06: Complex layered HTML/CSS | Clipping, opacity, shadows, filters, masks, z-index, pseudo-elements, transforms | Different CSS classes/viewport sizes |
| S07: Embedded video with transforms/perspective | Seeking, video sampling, occlusion, animated matrix3d | Videos, seeking patterns, warp geometry |
| S08: React-heavy dashboard | Reconciliation/layout/DOM factor | Dynamic charts, counters, class changes |
| S09: Canvas/SVG/WebGL animation | Bound detection and unsafe fallback | Script-driven state, image effects |
| S10: Fully changing full-screen content | Negative control for ROI/background/layers | Dense animation, video background |
| S11: Repeated scenes with varied text/assets | Reusable plan validity under changed inputs | Long/short text, alternate images/fonts |
| S12: Long-running many-job stress | Tab reuse stability and memory lifecycle | 100+ jobs, cancellation, CDP stalls |

Cross scene evaluation should stratify by resolution, duration, hardware (4-core CPU, real GPU where available), and concurrency; a loss in S01 may become a meaningful win in S03, S04, S05, or S08. When suitable, choose strategy by cost model rather than one fixed global default.

## Open implementation tasks

- [ ] Record independent `analysis_ms`, `validation_ms`, `execution_ms` for each candidate; where shared analysis prevents direct accounting, record **incremental analysis cost** with controlled compiler ablations. Compare **runtime instance analysis** with **reusable-plan compilation** separately.
- [ ] Add explicit workload routing: bounded reusable templates prefer a saved RenderPlan, while one-off or too-unpredictable scenes use safe, low-overhead runtime analysis. Support hybrid/fallback when some reusable facts remain valid.
- [ ] Make controls independent and show resolved flags; support safe automatic choices plus explicit override/fallback.
- [ ] Move every scene-derived constant and proof to the plan. Engine must not contain `Hello` text, selectors, motion endpoints, background value or ROI.
- [ ] Make per-job inputs real: verify title changes and assets are not frozen in a plan.
- [ ] Support nonuniform background reconstruction and multi-ROI, not just a solid color.
- [ ] Investigate exact Chromium-equivalent translation/opacity for external element reuse; test integer vs fractional positions and occlusion.
- [ ] Prove repetition (whole frame and partial phases) for a **declared input domain**, not merely for one observed video.
- [ ] Finish multi-scene corpus and append an experiment row per candidate, scene and environment; preserve negative results.
- [ ] Add adaptive plan strategy selection and benchmark the cost of evaluating the strategy itself.
- [ ] Keep optional visual-asset caching separate from ordinary instruction-based precompilation and from source-video/finished-frame replay.

## Experiment ledger schema (append rows; never overwrite unfavorable evidence)

```text
run_id | date | scene_id | scene_sha256 | input_hash | workload_mode | plan_validity_domain | hardware | chromium | encoder |
optimization_id | compiler_flags | renderer_flags | runtime_strategy |
analysis_ms | validation_ms | runtime_setup_ms | render_encode_ms | end_to_end_ms |
reference_sha256 | output_sha256 | exact_match | rss_peak_mb | notes | status
```

**Revision policy:** When new evidence contradicts an earlier conclusion, add the new observation and explain differences in scene, renderer, compiler, tab lifecycle, CPU/GPU, or encoder. Retain the old observation with provenance. Treat catalog classifications as revisable hypotheses, not settled truths.

## 2026-11-01: Runtime mathematical inference vs empirical precompilation audit

**Correction:** The current `plan_renderer.js` compiler is primarily an **empirical pixel-scan optimizer**, not a mathematical planner. It renders all 120 frames and scans pixels for foreground bounds, compares full-frame hashes to discover a repeated tail, and performs an additional full 120-frame row-change scan for reusable bands. Treat the current full-frame `--mode runtime` timings as a **conservative control**, not as proof that analysis-driven runtime optimization cannot pay off.

A saved plan from the expanded run reports 6.0654 seconds full-frame scan, 4.882 seconds stable-band scan, and 18.2592 seconds total compilation/validation including additional choices. These costs are not intrinsically necessary for all candidate discovery.

An isolated TypeScript-AST candidate generator, bundled as `miniator_runtime_inference_probe.zip` in the experiment workspace, extracts the known Remotion primitives and static-style candidates from the **unchanged** `Hello.tsx` without rendering or screenshots. It detects `interpolate` clamps at frames 20/90, `Sequence from=30`, a `spring({frame, fps})` call, and background candidate `#141414`. AST inference measured about 13 ms; full cold Node invocation about 186 ms median in 12 runs. This is a **candidate generator only**, NOT verified safe cropping/repetition. Source numeric completion does not prove pixel repetition: the title's spring transform still changes by tiny fractions of a pixel after frame 90, while Chromium's validated output happens to quantize to identical pixels. Validity with variable inputs, HTML effects, CSS and arbitrary JS remains unresolved.

**Next action:** implement source/data dependency graphs; derive transforms/ranges analytically for supported primitives, measure text/images/layout once per render, compute conservative bounds with effect margins, support fast per-job invalidation and full-frame fallback for unknowns. For repeated frames require a proof that the entire visible output is stable, or perform selective pixel validation; do not infer byte identity just because one `interpolate()` has clamped. Measure `analysis + render` for the one-off workload before calling it runtime-beneficial. Keep expensive exhaustive scans as an optional precompilation/validation strategy, not the default runtime inference algorithm.


## 2026-11-01: Implemented runtime mathematical ROI inference

Prototype package: `miniator_runtime_math_renderer_2026-11-01.zip`. Scene unchanged: Remotion `Hello.tsx`.

- Runtime source-level numeric analysis of supported `spring`, `interpolate`, `translateY`, opacity and interpolated text, plus DOM measurements at structural transitions. Derives ROI `x=725,y=412,w=470,h=280`; background `#141414`; no full-frame pixel scanning, no precompiled RenderPlan, no cached images.
- Reused worker 5-run **median analysis 0.0236 s**, median complete job 0.7272 s; full-frame 4x3 control median 2.1600 s. Fresh tabs 3-run median analysis 0.1050 s, complete job 1.0016 s; full-frame control 2.4668 s. SHA-256 identical for all completed runs. These numbers include per-job analysis and FFmpeg.
- Unsupported JS/CSS/media patterns fail closed to full-frame rendering. Scope remains a restricted supported syntax, not a proof for all HTML/CSS. Dynamic input variations require more comprehensive validation.
- Whole-frame repetition deliberately disabled at runtime because an asymptotic `spring()` still has nonconstant numeric output after the counter stops. Other promising techniques remain cataloged, not discarded.


## 2026-11-01: competitor-derived technique isolation and combined benchmark (383 hash-exact measured renders)

See `miniator_competitor_techniques_2026-11-01/EXPERIMENT_REPORT.md` for complete raw timing provenance and command lines. **New candidate `ENC-02`: convert cropped BGRA to yuv420p BEFORE background padding**, avoiding full-frame pixel conversion. One-tab, 12-slot, seven-run interleaved comparison: baseline 0.6589 s vs pre-pad 0.5027 s, exact MP4 hash. Correctness depends on chroma-safe (even) crop alignment; a runtime-inferred x=725 ROI failed checksum, but conservative x=724,width=472 expansion passed. Treat as CONDITIONAL until tested across backgrounds, transparency, color spaces and varying content.

Retain these other attempts, including failures:

- `CAP-03`: patched `remotionFastViewport` (with matching clip): hash-exact on Hello, no demonstrated speedup in two-run probe.
- `CAP-04`: `remotionCopyCurrentSurface`: **failed final MP4 SHA** in first test; known stale-surface hazard upstream. Research only, do not use without synchronization.
- `ENC-03`: explicit FFmpeg filter-thread count 1 made this scene much slower (~0.9s vs ~0.65s), while counts 2/4 did not establish benefit in brief probes.
- `BROWSER-01`: disabling background-tab throttling/reprioritizing renderers did not yield a reliable gain in short tests.
- `BROWSER-02`: removing `--disable-dev-shm-usage` and retaining Chromium's shared-memory transport gave possible but inconclusive improvements in two runs.
- `ENC-04`: start FFmpeg during browser tab initialization; output matched, but no stable advantage with already reused tabs.
- `ATL-02`: retuned concurrency AFTER changing encoding bottleneck: 4 tabs×16 slots became highly competitive, as did 4×12; grid2/grid4/grid8 atlas variants showed small/noisy differences. Revisit on new scenes/hardware.
- `DOM-01` and `LYR-01`: still hash-exact, but not independently beneficial in faster four-tab tests; do not delete because they may help richer scenes.

**Selected combined config** (precompiled INSTRUCTIONS only; no cached output/visual assets): 4 reused tabs ×16 slots, YUV-before-pad, pipeline overlap, original live React, atlas ROI, background reconstruction, proven 29-frame repetition. Eleven-run median 0.3963 s, all exact hash. Seven-run reused-tab/new-tab study: 0.3772 / 0.5866 s medians, confirming tab reuse. **Runtime math discovery** (no RenderPlan) plus 4×16 with YUV-before-pad/pipeline: seven-run median 0.4939 s INCLUDING per-job analysis (0.0193 s median), all exact hash.

The prior native Remotion median of 2.6618 s is historical and was not rerun. The gain here is measured only for the exact Hello fixture on a 4-core CPU, no GPU. Always keep fresh/missing plans, input variation, and different content backends in separate eligibility categories.


## 2026-11-01: ManyCards computed-shadow region trial

Keep **computed CSS shadow bounds** as a runtime/precompiled candidate. In an original 960×540, 90-frame locally authored ManyCards Remotion scene, computed `box-shadow: 0px 7px 16px 0px` on a spring-animated card creates changed pixels outside the measured DOM rectangle. For native decoded frame 0→1, a 5px ROI margin misses 9,366 of 46,177 changed pixels (20.28%), 16px misses 2,376, 24px misses 208, and 32px misses 0; a conservative asymmetric shadow bound derived from the CSS blur and offset also misses 0. Standalone JS parsing takes approximately 1.4 microseconds, excluding DOM measurement. Report and reproducible utility are in `miniator_shadow_investigation_2026-11-01`.

**Separately:** Full-frame single-slot Miniator with a recovered corrected layout matched 35/90 native decoded frames, compared with 2/90 for full-frame 4×3 atlas. The older wide-grid bundle matched only 1/90. None of these cases involved tight crop boundaries. Do not describe all cross-renderer mismatches as missed shadow ROI. Keep a separate **atlas/compositor/fractional-layout fidelity** candidate and preserve quantitative discrepancy metrics. CSS box-shadow footprint formulas require pinned Chromium validation and conservative fallback under complex effects; no generic exactness proof yet.

## 2026-11-01: Five-scene native Remotion vs Miniator performance sweep

The independent run and logged measurements are bundled as `miniator_multiscene_performance_2026-11-01.zip` with `MULTISCENE_BENCHMARK_REPORT.md`, `results/all_summary.json` and `PERFORMANCE_AND_FIDELITY_BACKLOG.md`. This is a **3-run exploratory sweep** on a 4-core CPU/no GPU, not a statistically conclusive benchmark. Hello is the unchanged real benchmark fixture (120 frames, 1920×1080); SimpleSequences, MovingTiles, ManyCards and GradientMotion are **locally authored synthetic stress fixtures** (90 frames, 960×540), not publicly published benchmark compositions.

| Scene | Native Remotion median | Miniator full-frame new tabs 4×3 | Miniator worker reused (analysis included) | Exact decoded Miniator/native frames |
| --- | ---: | ---: | ---: | ---: |
| Hello | 2.3057s | 2.0115s | 0.4444s | 120/120 |
| SimpleSequences | 1.2846s | 0.7142s | 0.4983s | 90/90 |
| MovingTiles | 1.4128s | 0.8527s | 0.6595s | 4/90 |
| ManyCards | 1.5012s | 0.9392s | 0.7023s | 2/90 |
| GradientMotion | 1.5981s | 1.1268s | 0.8489s | 1/90 |

All Miniator 4×3 variants passed their own scene-specific reference MP4 SHA checks. Native output is compared independently through decoded-frame hashes because FFmpeg/container settings may differ. Do **not** infer equivalence from same-Miniator hash matching. Hello runtime inference chose a safe ROI (analysis median 15.8ms); other four scenes conservatively fell back to full frame after unsupported expressions (`Math.min`, `Array.from`, etc). Their analysis medians were 2–6ms, and their speed was largely from persistent tab reuse. Low native exact-frame counts are known fidelity trade-offs, not grounds to discard the speed experiments.

Atlas size experiment (new tabs, three runs per option): 4×2 was slowest for all four smaller scenes; 4×4 was faster than 4×3 by roughly 3–6%, but changed Miniator MP4 hashes for MovingTiles, ManyCards, GradientMotion (zero out of three exact matches in each). SimpleSequences matched in all configurations. This suggests atlas layout can change browser rasterization. Keep 4×4 as a **fidelity-sensitive optional candidate**; quantify perceptual error before any default behavior change. Saved separate inconsistency backlog for correctness and performance follow-up, priority on performance first.

A separate five-run rerun of the Hello precompiled 4×16 saved-plan implementation gave 0.4370s median (0.3896, 0.4130, 0.4370, 0.4743, 0.5173s), five exact Miniator hashes. This is an independent suite and close to 0.4444s runtime analysis median; do not claim meaningful head-to-head superiority. No expensive full-timeline precompilation was repeated for other scenes.

Next: interleaved seven-plus-run trials with the **same initialized-tab lifecycle**, broaden runtime mathematical inference to loops/arrays/CSS effects, exercise precompiled instructions under variable template inputs, and tune atlas size with an exact/perceptual fidelity criterion. Preserve all failed and negative candidates.

## 2026-11-01: Pinned Chromium geometry / multi-scene fidelity research

Experiment package: `miniator_chromium_geometry_2026-11-01.zip`, report `CHROMIUM_PREDICTION_REPORT.md`.

- Runtime TS AST numeric transform evaluation + **actual Chromium 157 computed DOM geometry**: 16 MovingTiles elements in ~26.5ms, 12 ManyCards in ~39.4ms including DOM, no full timeline screenshot scan. Chromium uses transform, clip, effect and scroll paint-property trees; `getBoundingClientRect()` excludes ink overflow effects. Read computed `box-shadow`, filter and the actual Chrome viewport/DPR, not generic browser defaults. Blink/Skia source indicates blur sigma and a potentially wider border-shape shadow path; conservative bounds added, with version-specific proof still pending.
- MovingTiles geometry covered 82.9% (84.86% after sample/encoder margin). Normal cost gate correctly rejected crop; 4×3 reused tabs median **0.6444s exact** vs forced crop **0.8313s inexact** (three runs each). Preserve loss and fidelity failure rather than generalizing to all scenes.
- Current native vs Miniator decoded mean differing-pixel fraction / mean absolute RGB-channel difference / PSNR: SimpleSequences 0%/0/∞; MovingTiles 3.552%/0.0376/59.13dB; ManyCards 11.829%/0.19244/49.99dB; GradientMotion 66.754%/0.87033/45.07dB. Differences generally small in amplitude, but exact equivalence not established. Include full 90-frame diagnostics.
- A 4px extra margin eliminated observed >3-level nonbackground pixels outside MovingTiles ROI in the decoded native reference; despite that, the MP4 checksum still changed under cropped atlas due to combined sampling/encoding factors. Conservative predicted geometry does not imply bit-identical final output.
- Unresolved: compare pre-encoding pixels under matched Chromium page origins, native and Miniator CSS/font environments, clip/effect property-tree bounds, tab/slot layout; extend AST to discrete sequences, full-screen gradient and advanced effects with safe fallback; evaluate multi-ROI.

## 2026-11-01: Fresh same-version React controls for compiled JS/CSS (5 scenes)

Control policy corrected: each scene is rebuilt from the **identical original TSX source** for React and both compiled strategies; source hashes checked before the run. The reference is a newly rendered React MP4 with the exact same Chromium/atlas/FFmpeg settings, **not** a historic saved hash. Existing old MP4 hashes are diagnostics only and may differ for reasons unrelated to React compilation (e.g. atlas configuration). Each comparison uses warmed persistent tabs and interleaved measurements.

| Scene | React median | Compiled JS median | Compiled CSS median | Repetitions per mode | Current React MP4 hash match |
| --- | ---: | ---: | ---: | ---: | --- |
| Hello original, cropped 4x16 | 0.4125 s | 0.4184 s | 0.4503 s | 7 | All exact |
| SimpleSequences | 0.8045 s | 0.7861 s | 0.7893 s | 5 | All exact |
| MovingTiles | 0.9791 s | 0.9757 s | 0.9268 s | 5 | All exact |
| ManyCards | 1.0958 s | 1.0397 s | 1.0361 s | 5 | All exact |
| GradientMotion | 1.2259 s | 1.2184 s | 1.2169 s | 5 | All exact |

All **81 timed outputs** matched their own current-scene React baseline byte for byte. The previously different historic ManyCards reference was *not* used as a correctness gate. This comparison measures the execution strategy, not external/native Remotion parity. The compiled path currently evaluates JSX and patches a small virtual tree per frame; it has removed React reconciliation, but is not yet a fine-grained static dependency/dataflow compiler. Gains are scene-dependent; negative/neutral results are retained. Full reproducible runner, raw JSON/CSV measurements, source, and report are in `miniator_react_same_version_comparison_2026-11-01.zip`.

## 2026-11-01: Correction: true React static-dependency compiler versus JSX tree replay

**Earlier experiment was mischaracterized.** The previous `compiled_runtime.js` still called `resolve(jsx(Component, {}))` and recursively patched a virtual tree **every frame**. That is a React-reconciler replacement, NOT compilation of frame dependencies into minimal property updates. Do not use the earlier `compiledjs`/`compiledcss` medians to evaluate the potential of true React compilation.

Implemented separate `dependency_transform.js` + `static_runtime.js` compiler. A TypeScript AST dependency walk identifies values transitively depending on `useCurrentFrame()`, emits memoized per-frame derived expressions and callbacks for affected JSX style/text, and constructs DOM once per atlas slot. `Sequence` attaches/detaches cached DOM rather than rebuilding components. Optional `staticcss` uses CSS variables for eligible properties. After bootstrap there are no React reconciliation passes, component invocations, JSX tree construction or virtual-DOM diff passes. One derived spring used by two style properties is evaluated only once per frame.

Fresh-React **same-version**, same-geometry/encoder comparisons, each mode exact MP4 SHA-256, median seconds:

| Scene | React | Static JS | Static CSS | repetitions each |
|---|---:|---:|---:|---:|
| Hello_original | 0.4641 | 0.4346 | 0.4344 | 5 |
| SimpleSequences | 0.5651 | 0.5570 | 0.5666 | 7 |
| MovingTiles | 0.8749 | 0.7835 | 0.7397 | 5 |
| ManyCards | 0.8753 | 0.8057 | 0.8615 | 5 |
| GradientMotion | 0.9740 | 0.9437 | 0.9658 | 5 |

A cold standalone Hello TSX→static-bundle compilation measured ~220-235 ms, **not included** in these warm-tab rendering medians. Treat the numbers as precompiled-template economics. The AST compiler is specialized to behaviors present in these five test scenes, not a formal predictor of all React/JavaScript. Runtime compilation and changing input support still need benchmarking and validity guarantees. Some earlier two-run differences were much larger than later five-run results: preserve both; do not overinterpret small deltas. Independent native-Remotion fidelity differences remain in separate backlog.

Source and raw per-run JSON: `miniator_static_dependency_compiler_2026-11-01.zip`; summary `STATIC_COMPILER_REPORT.md`. Future work: native/Rust dependency IR, interval-aware motion analyses, dynamic input domains, class toggle lowering and style phase plans, choice of exact CSS vars versus direct properties, and selective runtime compilation based on scene complexity/break-even.

## 2026-11-01: True React static-dependency compiler (correction to prior JSX patcher)

The older `compiledjs/compiledcss` variants were *per-frame JSX-tree evaluation plus DOM patching*, not true ahead-of-time React-elimination. A separate `staticjs/staticcss` source compiler now analyzes TSX with TypeScript AST, computes transitive dependencies on `useCurrentFrame()`, transforms dynamic local values into frame-indexed closures and JSX leaf styles/text into updater callbacks, builds DOM exactly once per atlas slot, and runs only the identified update callbacks per frame, without React reconciliation, per-frame JSX rebuilding or virtual DOM diff. CSS custom properties are optional and disabled for transform/filter combinations that diverge in Chromium. Full code/measurements: `/mnt/data/miniator_true_static_react_compiler_2026-11-01.zip`.

**New controlled five-run medians (fresh same-version React reference MP4 each scene, all compiler variants SHA-256 exact, four persistent Chromium tabs, identical capture/encoder settings within scene):**

| Scene | React | Static JS | Static CSS | Offline compiler time |
| --- | ---: | ---: | ---: | ---: |
| Hello_original | 0.4351s | 0.4229s | 0.4331s | 0.2201s |
| SimpleSequences | 0.5642s | 0.5844s | 0.5807s | 0.2524s |
| MovingTiles | 0.7384s | 0.7367s | 0.7300s | 0.2840s |
| ManyCards | 0.8308s | 0.7464s | 0.8358s | 0.2245s |
| GradientMotion | 0.9368s | 0.9178s | 0.9443s | 0.2222s |

These are total warm render+encode times **excluding** analysis/build. Precompile is most promising where repeated jobs amortize compilation; runtime-on-each-job must include compiler time and is not established as profitable. This compiler covers the observed five-scene features, *not arbitrary React*. It still evaluates dynamic mathematical expressions per frame inside updaters, not Rust symbolic precomputed schedules. For future improvements: native/Rust dependency and interval evaluator, frame-time lookup tables when beneficial, expression common-subexpression elimination across slots, static subtree hoisting, compiled CSS class toggles, and cost-based auto-selection. Keep JSX patcher results distinct and retain negatively performing cases.

## 2026-11-01: Deterministic React-free predictive compiler coverage expansion

**Experimental package:** `miniator_predictive_coverage_48_scenes_2026-11-01.zip` and accompanying `COVERAGE_REPORT.md` / `BACKLOG.md`.

The dependency TSX compiler now handles transitive frame dependencies with TypeScript lexical symbols (including shorthand object value symbols), nested component props, direct frame-hook reads, dynamic style objects/spreads/CSS variables, SVG attributes, conditionals/early returns, persistent branch DOM ranges, sequences, reactive mapped and filtered lists, conditional lists and indexed lazy creation, and seeded stateless procedural motion. On all tested scenes, DOM tree creation and JSX construction are avoided after the first complete traversal, while per-frame math remains in JavaScript closures. **It is not a React interpreter, Rust prediction solver, or proven production-safe transformation**.

**Controlled same-source differential test:** 48 scene source fixtures (the previous five plus 43 authored additional cases) rendered using **React 16.0.0/ReactDOM 16.0.1 and a local deterministic Remotion-API shim** against the static compiler under system **Chromium 144** at 960x540. All 336 sampled decoded screenshots were pixel-exact to a fresh React reference. All 4320 frame snapshots (48 x 90) matched in text, checked attributes, selected computed styles and DOM geometry. After the first full timeline traversal, every scene executed a second traversal with zero new JSX calls. Twenty-six syntactically unsafe/deterministic-compatibility case patterns were rejected by a fail-closed scanner. **These test results are not native Remotion video/MP4 correctness checks and do not measure arbitrary modern React hook compatibility**. They do not establish 95% coverage of real practical scenes, since the fixture population was constructed for this investigation.

**Warm compiler costs:** median 5.75ms AST analysis, 15.56ms total TSX compilation/transpilation per scene in one already initialized Node process. Runtime compiled updates measured separately (microbenchmarks only, no capture or FFmpeg); for ManyCards, React 0.7098ms/frame vs compiler 0.4174ms/frame in a 450-frame repeated-update/layout-flush experiment. Do not compare those measurements to earlier end-to-end video renderer results.

**Known limits:** the available controlled baseline is React16 with a local shim, not actual React18/19 and not real Remotion sequence-local hook semantics. Hooks (useState/useMemo/useEffect/useContext...), portals, class state, key-based reordering semantics, external modules, arbitrarily stateful JS, browser media and complex effects still need implementation/fallback and official native comparison. The syntax-based safety checker is not a mathematical proof of determinism. Collect independent real-world compositions before inferring population coverage. See package `BACKLOG.md` and per-case JSON. Preserve every initial failure and fix in experiment logs.

## 2026-11-02: Universal / template / input-specific preprocessing accounting

Archive: miniator_remotion_oneoff_and_parameterized_2026-11-02.zip. Shared framework/runtime bundling is excluded for both engines, as requested. New scene-only source compilation and per-input planning are counted for one-off scenes; template source compilation is charged once and reused across three genuinely different parameter sets (label, translation, opacity). Universal hosts import no benchmark scenes. Native renderMedia is used through a generic dynamic-scene composition. Retained Miniator SHM/atlas/native extraction pipeline is reused through an isolated adapter.

| Case | Scene | Miniator React ms | Miniator static ms | Remotion ms |
|---|---|---:|---:|---:|
| oneoff | Hello_original | 826.6 | 759.3 | 3777.5 |
| oneoff | SimpleSequences | 745.4 | 592.7 | 1689.8 |
| oneoff | MovingTiles | 935.2 | 1152.1 | 1945.8 |
| oneoff | ManyCards | 993.2 | 943.4 | 1931.9 |
| oneoff | GradientMotion | 1062.8 | 1086.2 | 1789.2 |
| oneoff | ComplexEffects | 982.0 | unmeasured | 1801.7 |
| oneoff | SeparatedEffects | 908.9 | unmeasured | 1749.5 |
| template | Hello_original | 2638.5 | 1913.0 | 3945.5 |
| template | SimpleSequences | 775.6 | 714.1 | 1786.9 |
| template | MovingTiles | 899.6 | 803.4 | 1863.9 |
| template | ManyCards | 978.2 | 814.4 | 1866.5 |
| template | GradientMotion | 1009.5 | 918.3 | 1817.0 |
| template | ComplexEffects | 878.6 | unmeasured | 1790.1 |
| template | SeparatedEffects | 897.0 | unmeasured | 1785.6 |

One-off static scene-only compilation costs about 32–50 ms with compiler engines/shared runtimes already initialized; the older ~220–350 ms workflow also rebuilt general runtime dependencies and/or launched a child compiler. Costs are different scopes, not an apples-to-apples compiler algorithm improvement. Optional static compilation helps some one-off fixtures and loses on others; retain all raw results. Template jobs reuse compiled code while passing new props and mounting fresh scene DOM; this does not establish cross-job persistent DOM-update economics.

Input-aware ROI works for original Hello. Parameterized source props exceed the retained predictor’s coverage, causing full-frame fallback; the higher parameterized Hello latency is not evidence that caching itself makes rendering slower. No preauthored packed ROI, repeated-frame schedule, full-frame snapshots or prior render plan is reused. This is not all optimizations integrated into production Miniator.

All 114 retained video frame counts/dimensions and hashes verified. All three parameter outputs differ; 48 decoded comparisons have SSIM 0.985492–0.999468, not pixel-exact. CPU quota 8 cores, RAM limit 8 GiB; Chromium 157, FFmpeg 9.0.2; four Miniator/five Remotion tabs. Benchmark cleanup fixed outside timing to release SHM pools; incomplete runs discarded, diagnostics preserved. No renderer baseline promotion.

## 2026-11-02: Correct cross-mode fixture mismatch

The earlier oneoff/template tables used different input sources (original versus added props/label/translation/opacity). Cross-table regression claims are invalid. Both modes already route through the same optimizer. Corrected matched_job.js uses identical parameterized source and values for both modes; 57 input pairs pass ROI/atlas/tabs/flags/source parity assertions. Fresh back-to-back Hello medians ms: {"react": {"oneoff": 2179.996665, "template": 2332.895891}, "static": {"oneoff": 2222.645072, "template": 1860.6748830000001}}. Three pairs per path; React residual ~7% difference is not resolved statistically, static template median is faster. No mode-specific optimization loss; shared predictor fails props in both modes. Full details: miniator_template_parity_correction_2026-11-02.zip. All 126 relevant videos have verified frame counts/hashes. No renderer baseline promotion.

## 2026-11-02: Profile before porting update math to native

Archive: miniator_update_calculation_profile_2026-11-02.zip. Five static-executor scenes, three real renders each. Instrumented fn() versus apply(), summed across four concurrent tabs; initial-mount math excluded, strings/timer overhead included, not pure arithmetic or additive wall-clock attribution.

| Scene | Calculation callbacks ms | Property application ms | Whole update loop ms | Whole job ms | Callback/job ratio |
|---|---:|---:|---:|---:|---:|
| Hello_original | 17.30 | 8.10 | 27.70 | 2155.8 | 0.802% |
| SimpleSequences | 0.10 | 0.70 | 3.00 | 616.7 | 0.016% |
| MovingTiles | 1.30 | 6.70 | 10.00 | 724.5 | 0.179% |
| ManyCards | 26.40 | 12.20 | 47.60 | 1071.0 | 2.465% |
| GradientMotion | 3.90 | 12.60 | 21.50 | 1013.4 | 0.385% |

Largest measured direct callback opportunity about 2.5% (ManyCards); no Rust/Wasm/native rewrite justified for these fixtures. Static path only; larger numerical workloads remain unmeasured. Output checks: 15/15 exact prior static MP4 hashes, 15/15 correct frame counts. Original shared bundle restored. Preserve this negative result.


## 2026-11-02: Corrected shared-memory seven-scene audit, recovered and independently verified

This is a **verification and consolidation of an existing same-host benchmark**, not a newly merged renderer or new render-performance run. `MINIATOR_REMOTION_VERIFIED_RECOVERY_2026-11-02.md` contains the manifest, ranges, timings and limitations. Previously timed Miniator medians (ms): Hello_original 656.5, SimpleSequences 574.6, MovingTiles 755.9, ManyCards 774.2, GradientMotion 1047.5, ComplexEffects 236.6, SeparatedEffects 262.9. Paired Remotion medians (ms): Hello_original 2259.8, SimpleSequences 1102.4, MovingTiles 1257.8, ManyCards 1291.7, GradientMotion 1483.3, ComplexEffects 1224.6, SeparatedEffects 1225.9. Remotion used its bundled `remotionshm` FFmpeg rather than the incompatible system binary. Independently reprobed all fourteen final videos for correct frames/dimensions and computed paired FFmpeg SSIM: Hello_original 1.000000, SimpleSequences 1.000000, MovingTiles 0.999938, ManyCards 0.999335, GradientMotion 0.994704, ComplexEffects 0.999925, SeparatedEffects 0.999888.

**Do not promote** this mixture of conditionally selected scene paths to a seven-scene full-optimization production baseline. Packed-region encoding remains effect-scene conditional, Hello uses its own ROI/repetition plan, and parameterized templates lack warm cross-job DOM and input-aware ROI; staticJS loses to React on MovingTiles and GradientMotion under some tested configs. Preserve losing and conditional options for future rebenchmarking rather than deleting them. Current approved packed-region baseline remains unchanged.


## 2026-11-02/03: Predictive atlas scheduler integrated, matched host-control benchmarking

Predictive source-level atlas preplanning (no DOM/pixel reads) was connected to the isolated general Miniator renderer. Current live inputs are constant-complexity descriptors; the standalone scheduler supports heterogeneous per-frame costs and parameter-keyed cached plans, but automatic compiler descriptor extraction is still not integrated. Previous Miniator vs predictive Miniator vs Remotion were rerun under matched inputs; per-scene medians and QA are in `MINIATOR_PREDICTIVE_ATLAS_MATCHED_BENCHMARK_2026-11-02.md`. The heuristic loses for some scenes, so retain validated old configurations. A separately verified combination ROI+static DOM+tail repetition improved Hello with an exact output hash (582.1 ms isolated, 600.1 ms guarded rerun). SeparatedEffects still uses separate packed rectangles, not a single bounding ROI. Keep tests with unchanged baseline; source and results in `miniator_predictive_merged_verified_2026-11-02.zip`. Results are warm/precompiled and not an end-to-end one-off/template comparison. **Do not overwrite approved baseline based on these limited trials.**
