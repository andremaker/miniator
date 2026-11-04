# External React compositions

Miniator can compile a React/TSX source file with a **default exported component**.
This initial interface uses the existing native shared-memory BGRA and FFmpeg encoder,
but conservative full-frame capture. Source and job artifacts live in an isolated
temporary workspace. Miniator does not overwrite its built-in fixtures.

See [`examples/animated-title.tsx`](../examples/animated-title.tsx) for a runnable composition.

The component receives `frame`, `timeInSeconds`, `fps`, `width`, `height`,
`durationInFrames`, and any JSON-serializable props passed to `render()`.
Animation is determined by these values rather than wall-clock time.

```js
const {compileComposition}=require('miniator');
const template=await compileComposition({source:'/path/to/Title.tsx',width:960,height:540,fps:30,durationInFrames:90});
try {
 await template.render({output:'title-a.mp4',props:{title:'A'}});
 await template.render({output:'title-b.mp4',props:{title:'B'}});
} finally {template.close()}
```

```sh
miniator render ./Title.tsx --width 960 --height 540 --fps 30 --frames 90 --output title.mp4 --props props.json
```

This initial API targets deterministic frame/props-driven React components.
It does not implement an external timeline/media framework, audio mixing,
arbitrary browser side effects, dynamic imports or server-dependent resources.
CEF is the sole capture backend and must be supplied as an external SDK.
Compiled scenes can be rendered repeatedly using persistent parameterized
sessions; see [parameterized sessions](parameterized-sessions.md).

ROI and packed-region planning are supported when a valid source/input scoped
prediction is available. Otherwise the planner conservatively uses full-frame
capture while preserving the native capture, atlas and encoding pipeline.
