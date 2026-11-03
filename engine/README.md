# Miniator engine: implementation notes

# Actual React-to-static-DOM dependency compiler

This is the true dependency-based optimization requested for Miniator. It is distinct from the earlier generic JSX-to-DOM patcher.

## Design

`dependency_transform.js` parses the source TSX with TypeScript, derives transitive `useCurrentFrame()` dependencies, and replaces dynamic local values with frame-aware closures. Dynamic JSX leaf styles and text become explicit update callbacks. `static_runtime.js` mounts the tree once (one tree per atlas slot) and calls only the corresponding leaf callbacks for each frame. It avoids React reconciliation and does not reevaluate JSX per frame. CSS-variable mode is a separate optional executor; use direct writes when style filters cause non-equivalent rasterization.

## Verified scenes

Hello_original, SimpleSequences, MovingTiles, ManyCards, GradientMotion. In each scene, 5 measured jobs per mode plus warmups were tested against a fresh React-rendered MP4 with identical TSX source, Chromium, atlas configuration, and FFmpeg parameters. All compiled output hashes matched the contemporary React output. See `TRUE_STATIC_COMPILER_REPORT.md` and CSV. These scenes are the coverage boundary, not all possible React behavior.

## To reproduce in the same environment

Requires Node.js, `typescript`, `esbuild`, `remotion`, `react`, and the renderer's existing dependencies under `node_modules`; FFmpeg; a patched Chromium build supporting `--remotion-shared-memory-capture`; Linux-compatible `atlas_native.node` (generated locally from `native/atlas_native.cc`). Set `REMOTION_BROWSER` to the Chromium executable. It is not a portable npm package.

```bash
node prepare_compiled_scene.js ManyCards
node build_static.js ManyCards
node plan_renderer.js --mode compiler-matrix --matrix-styles react,staticjs,staticcss --tabs 4 --slots 3 --atlas-columns 3 --reps 5 --output rerun_cards --filter-before-pad on --pipeline off --tab-lifecycle reused
```

For Hello, use `node prepare_compiled_scene.js Hello_original`, `node build_static.js Hello_original`, `--slots 12 --atlas-columns 1 --pipeline on --matrix-plan external_hello_renderplan.json`.

**Compiler cost:** ~0.22–0.28 s with a fresh Node process. Rendering medians exclude compiler cost, and warm tab reuse is common across all modes. Rust-backed symbolic execution, arbitrary hook/effect handling, stateful JS transformation, and mathematical expression pre-tabulation remain future work.
