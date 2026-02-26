# Changelog

All notable changes to this project will be documented in this file.

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

## 1.0.2 - 2026-02-26

### Added
- Iframe permission attributes: preview iframes now include `allow="camera; microphone; autoplay; display-capture"` to permit sketches to capture camera and microphone via p5's `createCapture()` in secure contexts (HTTPS or localhost).

### Docs
- Added example demonstrating `createCapture(VIDEO)` in `README.md` and `slides.md`.
