# Development

## Setup

Requires Linux x64, Node.js 22+, C++20, CMake, Ninja, FFmpeg, an X display (such as Xvfb), and the **matching official CEF Minimal SDK installed outside the repository**.

```bash
npm ci
npm run build:native
export CEF_ROOT=/absolute/path/to/external/cef-sdk
npm run build:cef
npm run build:scene
npm run doctor
npm run check
CEF_ROOT="$CEF_ROOT" xvfb-run -a npm test
```

The CEF build writes its native bridge binary to `$CEF_ROOT/Release/miniator_cef_bridge`, and puts CMake files under the system temporary directory unless `MINIATOR_CEF_BUILD_DIR` is configured. The source repository must never contain CEF SDK headers, binaries, resources, or generated JavaScript bundles. The `engine/atlas_native.node` build artifact is also ignored.

`npm run build:scene` prepares the seven-scene test corpus. The scene compiler is not a fully general production composition ingestion API. `npm run smoke` renders a prepared scene and verifies the encoded frame count. `npm test` includes CEF-backed capture/video tests when `CEF_ROOT`, the built bridge, the addon and `DISPLAY` are available; otherwise those tests are skipped.

## Safety and regression policy

- Keep full-frame capture as fallback when ROI bounds cannot be proven to cover changed content.
- Default `--damage-crop on` allows predicted ROI without historic QA certification; `--damage-crop off` selects full-frame capture.
- Preserve multi-tab atlas reuse, native BGRA transfer, packed regions, static DOM strategies, FFmpeg overlap, and eligible repetition.
- Native `OnPaint` correlation is mandatory to avoid stale surfaces. The reserved marker column is never encoded.
- Benchmark identical inputs with prewarmed tabs, interleaved runs and separately accounted planning/compiler work.
- No experimental optimizations should replace baseline behavior without measured visual and performance checks.

The default CI validates source, compilation and fixture tests with normal npm dependencies. Native CEF full-path tests require a separately provisioned runner; a passing source-only CI is not proof of video fidelity.
