# Development workflow

1. `npm ci` (requires npm registry access; fixed versions in `package-lock.json`).
2. `npm run build:native`.
3. Set `MINIATOR_BROWSER` to the compatible patched Chromium shell.
4. `npm run doctor` and `npm test`.
5. `npm run smoke` to execute one real small-scene render and probe video frames.

Use the existing generated bundles as a baseline. Rebuild via
`npx miniator prepare <scene>` when intentionally changing the scene source.
This mutates `engine/source/Hello.tsx`, scene fixture, and bundles; do not run
concurrent preparations in the same checkout.

Do not silently substitute stock Chrome: the capture uses
`Page.remotionCreateFramePool` and `Page.remotionReleaseFrame`.
No images are encoded during rendering. Offline PNG is allowed for QA.

**Resource policy:** use a limited number of tabs/slots, monitor cgroup memory,
clean shared-memory pools after interruption, and never benchmark during builds.

Only use fresh matched measurements, preferably interleaved. Validate captured
region coverage and frame counts, not only aggregate SSIM.
