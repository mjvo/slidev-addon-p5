# slidev-addon-p5 Architecture

Last updated: 2026-05-27

This document describes how `slidev-addon-p5` works today.

## Threat Model

- The addon assumes trusted-only slide content.
- Code fences provided to `<P5Canvas>` and `<P5Code>` are treated as author-controlled input.
- Additional iframe script URLs provided via component props are also treated as trusted author-controlled input.

## Purpose

The addon enables p5.js sketches in Slidev with:
- iframe-isolated execution for reliable input handling,
- Monaco Run integration for editable sketches,
- global-mode-to-instance-mode transpilation for safer reruns.

## Runtime Model

Two Vue components are exposed:
- `P5Canvas` (`components/P5Canvas.vue`): display-focused sketch rendering from slot code.
- `P5Code` (`components/P5Code.vue`): Monaco editor + Run workflow + iframe preview.

Both components use iframe-based execution (DOM fallback is removed).

## Core Modules

- `index.ts`: addon entry; default export is `setup/code-runners.ts`.
- `setup/code-runners.ts`: Slidev code-runner integration, AST-based p5 detection, transpile + iframe execution, iframe readiness waiting, console output bridge, stop button wiring.
- `vite.config.mjs`: repo-local Slidev/Vite build override to avoid manual-chunk circular mapping between Monaco types and Shiki in demo builds.
- `setup/iframe-bootstrap.ts`: shared iframe HTML bootstrap and background/theme resolution used by both components.
- `setup/p5-transpile.ts`: AST transform from p5 global mode to instance mode (`_p`).
- `setup/loop-guard.ts`: in-repo AST loop instrumentation (`while`/`for` variants) that throws timeout errors for infinite-loop protection.
- `setup/iframe-message-handler.ts`: secure postMessage routing with origin checks and message-type handlers.
- `setup/iframe-resize-handler.ts`: throttled resize handling from iframe messages.
- `setup/p5-version-manager.ts`: supported p5 versions and URL selection.
- `setup/p5-utils.ts`: idempotent teardown helpers (`safeRemoveP5`, `safeRemoveElement`).
- `components/P5ErrorBoundary.vue`: inline runtime error display UI.

## Execution Flows

### 1. `P5Canvas` flow (component-managed run)

1. Component mounts and observes its owning Slidev slide without starting a hidden sketch.
2. When the slide becomes active, the iframe document is initialized and p5 is loaded via version manager URL.
3. Code is extracted from slot content (or `code` prop fallback).
4. User code is instrumented by the in-repo loop guard before transpilation.
5. Code is transpiled to instance mode.
6. Transpiled code is injected via blob-backed `<script>` in iframe.
7. Iframe posts resize/ready messages; parent resizes iframe and surfaces errors.
8. When the slide becomes inactive, sound playback and the p5 instance are torn down and the iframe is reset; returning to the slide starts a new sketch instance.

### 2. `P5Code` flow (Monaco Run)

1. Component mounts and initializes iframe + message/resize handlers.
2. Slidev Run invokes custom runner in `setup/code-runners.ts`.
3. Runner detects p5 via AST signals (lifecycle hooks, p5 constructor usage, and signature calls; regex fallback if parse fails).
4. Runner waits for iframe-local p5 availability before first execution and then runs transpiled code in the matching iframe (keyed by `data-p5code-id`).
5. Console output is bridged to Monaco output panel.
6. Stop button is inserted next to Run; clicking it calls `noLoop()` on the iframe p5 instance.

### 3. Non-p5 JavaScript flow

If code does not match p5 detection, runner delegates to Slidev's JS runner when available.
If no delegate is available, runner returns an explicit error and does not execute code locally.

## Messaging Contract

Messages emitted from iframe include:
- `p5-iframe-ready`
- `p5-resize`
- `p5-error` (or structured error payloads routed by handler)

Handler behavior:
- validates origin,
- validates message source (`event.source`) against the owning iframe when configured,
- requires and/or pins `sketchInstanceId` where configured,
- routes by message type,
- surfaces `p5-error` messages through component `onError` handlers (error boundary + logs),
- reports dependency `<script>` load failures with the failing iframe URL through `p5-error`,
- throttles resize updates,
- ignores stale sketch IDs where applicable.

## Transpilation

`setup/p5-transpile.ts` converts global-style p5 code to instance mode using:
- `acorn` (parse),
- `acorn-walk` (AST traversal),
- `astring` (code generation).

Typical transform:
- `function setup(){...}` -> `_p.setup = function(){...}`
- `createCanvas(...)` -> `_p.createCanvas(...)`

## Lifecycle and Cleanup

- Old p5 instances are removed before rerun.
- `P5Canvas` starts only while its owning slide is active and restarts from initial state after leaving and returning to that slide.
- Leaving a `P5Canvas` slide stops tracked p5.sound sources before its iframe runtime is reset.
- Iframe container content is reset between executions.
- Parent-theme changes are observed and iframe background/theme state is synced live for existing iframe documents.
- Observer-based cleanup is deterministic per iframe run: prior cleanup observers are disconnected before new ones are registered.
- Cleanup observers self-remove after firing and are disconnected on explicit teardown.
- `safeRemoveP5` / `safeRemoveElement` are used to avoid double-removal and cross-realm teardown issues.
- Unmount removes message listeners and component-level resources.

## Version Loading

`setup/p5-version-manager.ts` supports pinned versions, custom CDN URLs for both
p5 core and p5.sound, and validated author-provided extra iframe scripts.

Precedence:
1. `p5CdnUrl` prop (highest)
2. `p5Version` prop
3. default latest supported version

p5.sound loading:
1. `p5SoundCdnUrl` prop (highest)
2. `p5SoundVersion` prop
3. latest tested `p5.sound` version (`0.2.0`) when enabled
4. skipped unless `enableP5Sound` is `true`

Extra script loading:
1. `externalP5Libs` prop values are validated and deduplicated
2. accepted URLs are loaded only inside the sketch iframe
3. load order is: p5 core, optional p5.sound, then `externalP5Libs` in author-provided order
4. accepted URL forms are `https://...`, `http://localhost...`, `http://127.0.0.1...`, and relative/root-relative URLs
5. dependency request failures are reported in the owning component's inline error UI with the failing URL

## Testing and CI

- Unit tests: `tests/unit` (Vitest)
- E2E tests: `tests/e2e` (Playwright)
- CI workflow: `.github/workflows/ci.yml` runs lint, typecheck, unit and E2E tests, package-content verification, and a demo build.

## Current Constraints

- p5 detection is heuristic (AST signal-based), not a full semantic classifier.
- Extremely slow CDN/library loads can still exceed the runner's readiness wait window.
- Loop guard protects `while`/`for` loop statements, but cannot guarantee termination for recursion or non-loop blocking patterns.
- Exported decks still fetch any configured extra iframe scripts at runtime, so remote script mutability remains part of the trust model.

## Practical Extension Points

- Improve detection precision for advanced/dynamic patterns without increasing false positives.
- Expand tests for extreme readiness delays and additional advanced sketch ID pairing scenarios.
- Add additional documented examples for custom p5 source loading patterns.
