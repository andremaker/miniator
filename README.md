# Miniator

Miniator is a CEF-based HTML/React-to-video renderer with shared-memory BGRA capture, native atlas tile extraction, ROI/packed-region planning and direct FFmpeg encoding.

**Runtime backend:** Chromium Embedded Framework (CEF) only. The CEF SDK and `libcef.so` are external dependencies and are never tracked in this repository. No alternative browser capture backend or third-party composition framework is part of this library.

## Build

Requires Linux, Node.js 22+, C++20 toolchain, CMake/Ninja, FFmpeg, Xvfb/headless display and an official matching CEF Linux x64 Minimal SDK.

```sh
npm ci
npm run build:native
CEF_ROOT=/absolute/path/to/unpacked/cef-sdk npm run build:cef
npm run build:scene
```

`build:cef` compiles the project-owned native bridge against the **external SDK**, placing the bridge executable under `$CEF_ROOT/Release/`. Neither headers nor binaries are copied into this repository. Set `CEF_ROOT` when running the renderer, and ensure `DISPLAY` points to a running display server (e.g. Xvfb).

```sh
export CEF_ROOT=/absolute/path/to/unpacked/cef-sdk
npm run doctor
node bin/miniator.js render --mode chosen --tabs 4 --slots 8 --reps 1 --output ./results
```

The renderer uses `OnPaint` to transport BGRA bytes through POSIX shared memory to the existing native atlas extraction and FFmpeg pipeline; no PNG or JPEG encoding is used in production capture.

The seven bundled fixture scenes are controlled engineering tests; an independent comparison engine may be run externally with matched settings and artifacts. No comparator code is distributed or depended upon by Miniator.

## Public React API (experimental)

```js
const {compileComposition} = require('miniator');
const template = await compileComposition({source:'./Title.tsx',width:960,height:540,fps:30,durationInFrames:90});
const session = template.createSession({tabs:4,slots:8});
try {
  await session.ready;
  await session.render({output:'a.mp4',props:{title:'A'}});
  await session.render({output:'b.mp4',props:{title:'B'}});
} finally { await session.close();template.close(); }
```

`compileComposition` supports an explicit `frame` prop. Automatic prediction is conditional on the scene's supported source/parameter geometry. Unknown scenes fall back to full frame. See `docs/external-compositions.md`, `docs/parameterized-sessions.md`, and `docs/optimization-policy.md` for supported behavior.

See `docs/architecture.md` for rendering implementation and `docs/development.md` for testing. This is experimental software; use visual and frame-count verification on new compositions before production use.
