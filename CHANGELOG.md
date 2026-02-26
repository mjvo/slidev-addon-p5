# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Iframe permission attributes: preview iframes now include `allow="camera; microphone; autoplay; display-capture"` to permit sketches to capture camera and microphone via p5's `createCapture()` in secure contexts (HTTPS or localhost).

### Fixed
- Switched runner-side p5 detection from a `setup()` regex to AST-based sketch signals (lifecycle hooks, constructor usage, and signature calls) with regex fallback when parsing fails.
- Added an iframe p5 readiness wait window before first execution so slow initial library loads do not fail on the first Run click.
- Fixed `p5-error` handler registration in both `P5Canvas` and `P5Code` so runtime errors consistently reach the inline error UI while still being logged.

### Tests
- Added unit coverage for `isLikelyP5Sketch` detection scenarios in `tests/unit/code-runners.spec.ts`.
- Added a Playwright regression that delays iframe p5 loading and asserts first Run still renders a canvas (`tests/e2e/p5-runner-e2e.spec.ts`).
- Tightened `error-ui` E2E synchronization to wait for Run controls/p5 markers before selecting the target slide.

### Docs
- Added example demonstrating `createCapture(VIDEO)` in `README.md` and `slides.md`.

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
