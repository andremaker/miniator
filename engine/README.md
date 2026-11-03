# Engine implementation guide

The engine source under this directory implements Miniator's browser-driven video pipeline. `plan_renderer.js` is currently the central orchestrator; auxiliary modules supply planning, DOM compilation and fixture preparation. This file is a **code map**; benchmark findings belong in the [optimization catalog](../docs/optimization-catalog.md) and focused reports below.

## Core files

| File | Responsibility |
| --- | --- |
| `plan_renderer.js` | Parse renderer flags, load prepared source/fixture/plan, operate Chromium tabs via CDP, invoke native frame extraction and FFmpeg, write timing summaries. |
| `atlas_capacity_planner.js` | Predict host-constrained tab/slot candidates from capture geometry and coarse source complexity. |
| `predictive_atlas_plan.js` | Pure frame-cost batching and reusable plans for explicitly declared parameter dependencies. |
| `dependency_transform.js`, `static_runtime.js` | Compile supported frame-dependent TSX properties to DOM update callbacks and execute them. |
| `prepare_compiled_scene.js` | Select one of seven fixtures, generate browser bundles, and update local fixture metadata. |
| `build_static.js`, `build_compiled_js.js` | Build optional scene execution variants. |
| `source/`, `references/` | Canonical fixture sources and reference metadata. |
| `strategy_registry_general.json` | Source/input-scoped strategy candidates and selected options. |

## Runtime constraints

Set `MINIATOR_BROWSER` to a compatible patched Chromium executable, compile the native addon with `npm run build:native`, and prepare a scene before rendering. The encoder requires FFmpeg. `--mode chosen` uses the strategy registry when a source/input entry matches and otherwise retains a fallback; `--predictive-atlas on` enables the pre-render batch planner with current heuristic descriptors. Unsupported input-dependent geometry should not be assumed safe for ROI/packing.

The renderer may reuse tabs within a process, but the public Node adapter launches a fresh process for each `render()` call. Preparing fixtures rewrites shared generated artifacts, so use separate worktrees for parallel scenarios.

## Component-specific evidence

- [Predictive atlas planning](PREDICTIVE_ATLAS_PLANNER_STATUS.md): actual integration and outstanding limits.
- [Static dependency compiler experiment](TRUE_STATIC_COMPILER_REPORT.md): source transformation, measurements, and semantic coverage for the five tested scenes.
- [Rendering architecture](../docs/architecture.md): end-to-end data flow and module responsibilities.
- [Development guide](../docs/development.md): setup, validation and benchmark practice.
