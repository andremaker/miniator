# Developer guide

This guide covers building, testing and changing Miniator. Start with [architecture](architecture.md) to understand which components share state and [capability status](capability-status.md) to avoid relying on unimplemented APIs.

## Local setup

Requirements: Linux x86-64, Node.js 22+, C++17 compiler and Node-API headers, compatible patched Chromium, FFmpeg/ffprobe.

```bash
npm ci
npm run build:native
npm run build:scene
export MINIATOR_BROWSER=/absolute/path/to/patched-chrome-headless-shell
npm run doctor
npm run check
npm test
npm run smoke
```

`npm run build:scene` prepares `SeparatedEffects`. `npm run doctor` tests executable presence/version and installed dependencies, but full CDP/shared-memory compatibility must be exercised by `npm run smoke`. Local environment variables `MINIATOR_FFMPEG`, `CXX`, and `MINIATOR_NODE_HEADERS` can override the FFmpeg binary, compiler and Node header location.

## Fixture build model

`node bin/miniator.js prepare <fixture>` copies the selected TSX into `engine/source/Hello.tsx`, updates `engine/scene_fixture.json`, and regenerates files under `engine/precompiled/` and other ignored build locations. **This mutates shared workspace state.** Serialize fixture preparations or use separate worktrees when running tests in parallel. Generated bundles may contain installed third-party code and must not be committed.

`node bin/miniator.js compile-static <fixture>` compiles a bounded TSX subset; it is not guaranteed to work on every scene. The engine's selected-mode registry uses source/input hashes and conditional fallbacks; don't hardcode a historical winning strategy as universal.

## Running checks

| Command | Purpose | Requirements |
| --- | --- | --- |
| `npm run check` | Syntax, JSON manifests, source namespace and third-party boundary | Git and Node.js |
| `npm test` | Unit, lightweight integration, offline reference fidelity | Built addon and locally generated scene files for some tests |
| `npm run smoke` | Browser capture -> native extraction -> MP4 and frame count | Patched Chromium and FFmpeg/ffprobe |
| `npm run benchmark:remotion -- ...` | Invoke external CLI for comparison | Remotion dev dependencies and a valid Remotion entry point |

CI's default job exercises build, check and tests. Browser-backed smoke and controlled performance comparisons require a provisioned runner; the default CI smoke job is disabled. Benchmark workflow is currently documentation-only, not an automated fairness harness.

## Safe renderer changes

1. Keep the last validated Miniator revision as a control and change one mechanism at a time.
2. Preserve capabilities that can combine: static updates, packed/ROI capture, frame repetition, native BGRA transfer, pipeline overlap, warmed tabs and pre-render predictive batching.
3. Benchmark old and new builds fresh under the same host load and scene inputs. Interleave repetitions; record median and spread.
4. Validate frame count and outside-ROI changed content. Small in-region raster differences are acceptable in ROI mode when declared; strict pixel tests are separate.
5. Log losing optimizations and their eligible workloads in the [optimization catalog](optimization-catalog.md).
6. Clean up Chromium processes and `/dev/shm` pools, especially after timeouts. Never benchmark concurrently with builds or heavy QA.

## Compatibility and project boundaries

A patched Chromium implementing custom frame-pool CDP commands is required; stock Chrome is not a substitute. The browser binary, generated bundles and native `.node` binaries are not checked into source control. Remotion is used as an external benchmark opponent; some included fixture adapters still import installed Remotion APIs, which is a known compatibility dependency rather than bundled implementation code.
