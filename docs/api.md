# API / CLI (experimental)

```js
const {render, prepareScene, compileStatic} = require('miniator');

await prepareScene('Hello_original');
const result = await render({
  browserPath: '/path/to/patched-chrome',
  args: ['--mode','chosen','--reps','1','--output','./output'],
  onStdout: console.log,
});
```

This is a process adapter to the existing CLI and returns stdout/stderr and
exit status. **It does not promise persistent browser reuse between API calls**.
The engine itself does reuse tabs during a job. The fixture preparation scripts
mutate generated code in the engine directory and must not run concurrently.

CLI: `npx miniator help`. Other commands: `doctor`, `prepare`,
`compile-static`, `render`. Renderer flags are passed through unchanged.

A persistent long-running worker API with input isolation, cancellation,
streaming, and robust template caching is future work, not included in v0.1.0.
