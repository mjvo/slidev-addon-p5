# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Fixed
- Kept multiple `<P5Code>` sketches on the same slide from clearing each other during Run cleanup by observing slide visibility instead of individual iframe visibility.

### Changed
- Consolidated shared iframe theme syncing, console log capture, and error-message handling helpers used by `P5Canvas` and `P5Code`.

### Tests
- Added E2E regression coverage for iframe canvas focus after Run, live theme background syncing, and multiple `<P5Code>` sketches sharing one slide.
- Added unit coverage for the shared iframe console/error helpers.

### Docs
- Clarified keyboard focus behavior and refreshed testing/CI notes to match the current validation workflow.

## 1.0.7 - 2026-04-15

### Fixed
- Published the finalized post-`1.0.6` stability fixes as a new npm release after the prior `1.0.6` publish was withdrawn.
- Fixed `P5Canvas` iframe sizing so square and high-DPI / WEBGL sketches keep their intended display width.
- Fixed stale `sketchInstanceId` filtering in iframe resize handling so both `P5Canvas` and `P5Code` continue to resize correctly after reruns and iframe reinitialization.
- Restored stable top alignment for `P5Code` previews after resize updates.
- Switched TypeScript module resolution to `Bundler` so CI passes under current TypeScript without deprecated `node10` behavior.
- Restored the missing Playwright helper import used by the plain-JavaScript runner delegation regression test.

### Tests
- Added unit coverage for iframe resize sizing heuristics and dynamic sketch-id matching.
- Kept typecheck, lint, unit tests, demo build, and Playwright coverage aligned with the finalized release state.

### Docs
- Refreshed demo and snippet example canvas sizes to match the current sizing behavior and expected slide output.

## 1.0.6 - 2026-04-15

### Changed
- Refactored shared iframe runtime concerns into `setup/iframe-runtime.ts` so `P5Canvas` and `P5Code` share script URL resolution, iframe reset, log trimming, and message-origin handling.
- Simplified `setup/config.ts` to keep active runtime config in one place and routed stop-button styling through the shared config.
- Pinned local `@slidev/types` development dependency to the currently validated version instead of tracking `latest`.

### Fixed
- Stabilized the `error-ui` Playwright coverage by targeting the active visible slide/iframe instead of relying on the first matching slide clone in the DOM.
- Replaced silent runner failures with explicit actionable iframe-association errors when a Run button cannot be matched to a p5 iframe.
- Removed the `P5Canvas` autorun timing delay in favor of chaining the first run to iframe initialization completion.
- Fixed a `P5Canvas` sizing regression where iframe width could shrink incorrectly on high-DPI / WEBGL sketches by measuring the intended display size instead of trusting `offsetWidth` alone.
- Fixed stale `sketchInstanceId` filtering in iframe resize handling so both `P5Canvas` and `P5Code` continue to accept resize messages after iframe reinitialization.
- Restored stable top alignment for `P5Code` previews after resize by removing a shared iframe centering override that conflicted with the editor-side flex layout.
- Expanded the transpiler's p5 global inventory for newer p5.js 2.2+ APIs, including shader/strands helpers such as `buildFilterShader()` and related WebGL globals.
- Updated the default validated p5 runtime from `2.2.0` to `2.2.2`, which fixes `build*Shader()` support in instance-mode iframe sketches.
- Bridged p5.strands shader helpers like `mix()` into the iframe runtime for `build*Shader()` callbacks without broadening normal global-mode transpilation.

### Tests
- Added regression coverage for the explicit runner error path when no iframe can be matched.
- Added unit coverage for iframe resize sizing heuristics and dynamic sketch-id matching so canvas previews keep the intended dimensions after reruns.
- Added an iframe runtime regression that injects `buildFilterShader()` smoke-test code into Monaco so p5.strands shader builders are validated in-browser without depending on a dedicated demo slide.
- CI now runs frozen-lockfile install, typecheck, package-content verification, and a demo build smoke step in addition to lint, unit, and E2E tests.

### Docs
- Refreshed demo and snippet example canvas sizes to match the current sizing behavior and keep the sample output expectations consistent.

## 1.0.5 - 2026-03-25

### Added
- Added `externalP5Libs` / `:external-p5-libs` support so `P5Canvas` and `P5Code` can load additional author-provided libraries inside the sketch iframe after p5 core and optional `p5.sound`.
- Added demo slides covering both global-style and instance-aware external library usage, including ml5 HandPose and `p5.grain`.

### Tests
- Added unit coverage for external library URL validation, deduplication, and iframe script ordering.
- Added a Playwright smoke test that loads a local external helper library inside the sketch iframe and verifies it is usable at runtime.

### Docs
- Documented `externalP5Libs` usage patterns for both global-style and instance-aware external libraries.

## 1.0.4 - 2026-03-23

### Changed
- Replaced the unmaintained `loop-protect` dependency with an in-repo AST loop guard (`setup/loop-guard.ts`) used by `P5Canvas`, `P5Code`, and `setup/code-runners.ts`; loop timeouts now throw explicit runtime errors (default `100ms`, via `TIMING_CONFIG.loopGuardTimeoutMs`).

### Fixed
- Preserved Slidev's original Monaco JavaScript runner before overriding the shared `js`/`javascript` entries, so non-p5 Monaco code blocks delegate correctly instead of recursing and breaking standard JavaScript execution.

### Tests
- Added loop-guard unit coverage (`tests/unit/loop-guard.spec.ts`) and runner/transpile integration assertions in `tests/unit/code-runners.spec.ts` for timeout and normal execution paths.
- Added regression coverage for default-runner delegation in `tests/unit/code-runners.spec.ts` and Playwright coverage for plain Monaco JavaScript compatibility in `tests/e2e/p5-runner-e2e.spec.ts`.
- Stabilized `tests/e2e/error-ui.spec.ts` by targeting the intended p5 editor slide by content instead of relying on CI-sensitive slide visibility heuristics.

### Docs
- Added a compatibility smoke-test slide showing that Slidev's standard Monaco JavaScript runner still works with the addon installed.

## 1.0.3 - 2026-02-28

### Added
- Added opt-in p5.sound script loading support (uses `p5.sound@0.2.0` when enabled) across iframe bootstrap and component props, including overrides via `p5SoundVersion`/`p5SoundCdnUrl` and toggle via `enableP5Sound`.

### Fixed
- Stop-button and lifecycle cleanup now stop active p5.sound sources and reset iframe runtime state between runs so async `loadSound()` flows from prior runs cannot keep or re-layer playback.

### Tests
- Added unit coverage for p5/p5.sound URL resolution and ordered script injection in `tests/unit/p5-version-manager.spec.ts`.
- Added unit coverage for p5.sound stop/disconnect cleanup behavior in `tests/unit/p5-utils.spec.ts`.

### Docs
- Added a dedicated `slides.md` smoke-test slide demonstrating opt-in `p5.sound` loading via `:enable-p5-sound="true"` and updated README examples to emphasize that sound loading is off by default.
- Updated FFT demo bar coloring to an HSL red-to-blue sweep in `slides.md`.

## 1.0.2 - 2026-02-27

### Added
- Iframe permission attributes: preview iframes now include `allow="camera; microphone; autoplay; display-capture"` to permit sketches to capture camera and microphone via p5's `createCapture()` in secure contexts (HTTPS or localhost).

### Fixed
- Switched runner-side p5 detection from a `setup()` regex to AST-based sketch signals (lifecycle hooks, constructor usage, and signature calls) with regex fallback when parsing fails.
- Added an iframe p5 readiness wait window before first execution so slow initial library loads do not fail on the first Run click.
- Fixed `p5-error` handler registration in both `P5Canvas` and `P5Code` so runtime errors consistently reach the inline error UI while still being logged.
- Added repo-level Vite chunk overrides (`vite.config.mjs`) so Slidev demo builds no longer emit the `monaco/bundled-types` ↔ `modules/shiki` circular chunk warning.
- Updated `vite.config.mjs` export style so Slidev CI can load config without a direct `vite` dependency in this package.
- Fixed iframe theme/background syncing so pressing `d` in Slidev updates existing `P5Canvas`/`P5Code` iframe backgrounds (and iframe text color where enabled) without requiring a rerun.

### Tests
- Added unit coverage for `isLikelyP5Sketch` detection scenarios in `tests/unit/code-runners.spec.ts`.
- Added a Playwright regression that delays iframe p5 loading and asserts first Run still renders a canvas (`tests/e2e/p5-runner-e2e.spec.ts`).
- Tightened `error-ui` E2E synchronization to wait for Run controls/p5 markers before selecting the target slide.

### Docs
- Added example demonstrating `createCapture(VIDEO)` in `README.md` and `slides.md`.
- Added snippet import examples for `<P5Canvas>` and `<P5Code>` in `slides.md`, plus reusable files under `snippets/`.
- Consolidated webcam demo to a single slide and removed the completed snippet-example TODO from `README.md`.

## 1.0.1 - 2026-02-24

### Fixed
- Hardened iframe message routing and removed `eval` fallback from the runtime path.
- Made iframe cleanup observer lifecycle deterministic to avoid stale teardown behavior.
- Extracted a shared iframe bootstrap for `P5Canvas` and `P5Code` to reduce duplication and drift.

### Security
- Documented the trusted-content threat model and runtime guardrails.

### Packaging
- Limited published package contents via the `files` whitelist in `package.json`.

### Docs
- Simplified component syntax demo slides and cleaned up `v-click` flow in examples.
