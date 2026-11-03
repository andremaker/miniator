# Node.js API and command-line interface

Miniator currently exposes a **fixture-oriented process adapter**, not a general video-rendering SDK. The implementation lives in `src/index.js` and `bin/miniator.js`; both invoke scripts from `engine/`. The public adapter does not provide a long-running service.

## Node.js functions

```js
const {prepareScene, compileStatic, render} = require('./src');

await prepareScene('SeparatedEffects');
const result = await render({
  browserPath: '/absolute/path/to/patched-chrome-headless-shell',
  args: ['--mode', 'chosen', '--reps', '1', '--output', './video-output'],
  onStdout: (chunk) => process.stdout.write(chunk),
  onStderr: (chunk) => process.stderr.write(chunk),
});
console.log(result.code); // 0 if successful
```

The example assumes it runs from the repository root. When consuming the local package by its package name in a supported Node resolution context, use `require('miniator')` instead of `require('./src')`.

| Function | Input | Behavior |
| --- | --- | --- |
| `prepareScene(scene, options?)` | One of the seven fixture names | Builds/rewrites the active fixture and generated browser bundles in the repository. |
| `compileStatic(scene, options?)` | Scene identifier | Invokes `engine/build_static.js`; compilation succeeds only when that source is supported. |
| `render(options?)` | `args`, `browserPath`, `ffmpegPath`, `signal`, `onStdout`, `onStderr` | Starts `engine/plan_renderer.js` as a child process and waits for its exit. |

`render()` returns `{code, stdout, stderr}` for a successful exit; it **rejects** for a nonzero exit, signal, or spawn error. `args` must be an array of strings and is passed directly to the engine CLI. `signal` is an `AbortSignal` passed to Node's child-process spawn. The adapter buffers stdout and stderr while also forwarding optional callbacks, so it is not bounded-memory streaming output.

`prepareScene()` accepts: `Hello_original`, `SimpleSequences`, `MovingTiles`, `ManyCards`, `GradientMotion`, `ComplexEffects`, `SeparatedEffects`. Preparation mutates shared generated files; do not run it concurrently with another preparation in the same checkout.

## CLI

```bash
node bin/miniator.js help
node bin/miniator.js doctor
node bin/miniator.js prepare MovingTiles
node bin/miniator.js compile-static MovingTiles
node bin/miniator.js render --mode chosen --reps 1 --output ./render-output
```

`doctor` is a toolchain preflight, not an end-to-end browser capture test; `npm run smoke` exercises capture and encoding. `render` forwards the remaining flags to `engine/plan_renderer.js`. The engine has additional internal benchmarking and tuning flags; inspect that script before automation instead of assuming they form a stable public contract.

## Runtime lifecycle and limitations

- Every `render()` invocation starts a **new process**. Its tabs may be reused across repetitions within that process; independent API calls do not share its browser.
- Scene preparation changes the active working fixture and bundle files. It is not isolated per customer/job.
- A generic `compile(source, props)` API, parameterized template jobs, cross-job caching, progress events, robust cancellation of child process groups, and production concurrency controls are **not implemented** in this adapter.
- The engine depends on a separately provisioned patched Chromium and the native addon. See [development](development.md) and [capability status](capability-status.md).
