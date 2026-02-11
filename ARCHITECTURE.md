# slidev-addon-p5 Architecture

Last updated: 2026-02-11

This document describes how `slidev-addon-p5` works today.

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
- `setup/code-runners.ts`: Slidev code-runner integration, p5 detection, transpile + iframe execution, console output bridge, stop button wiring.
- `setup/p5-transpile.ts`: AST transform from p5 global mode to instance mode (`_p`).
- `setup/iframe-message-handler.ts`: secure postMessage routing with origin checks and message-type handlers.
- `setup/iframe-resize-handler.ts`: throttled resize handling from iframe messages.
- `setup/p5-version-manager.ts`: supported p5 versions and URL selection.
- `setup/p5-utils.ts`: idempotent teardown helpers (`safeRemoveP5`, `safeRemoveElement`).
- `components/P5ErrorBoundary.vue`: inline runtime error display UI.

## Execution Flows

### 1. `P5Canvas` flow (component-managed run)

1. Component mounts and creates an iframe document.
2. p5 is loaded in the iframe via version manager URL.
3. Code is extracted from slot content (or `code` prop fallback).
4. User code is loop-protect instrumented when available.
5. Code is transpiled to instance mode.
6. Transpiled code is injected via blob-backed `<script>` in iframe.
7. Iframe posts resize/ready messages; parent resizes iframe and surfaces errors.

### 2. `P5Code` flow (Monaco Run)

1. Component mounts and initializes iframe + message/resize handlers.
2. Slidev Run invokes custom runner in `setup/code-runners.ts`.
3. Runner detects p5 via `setup()` regex.
4. p5 code is transpiled and executed in the matching iframe (keyed by `data-p5code-id`).
5. Console output is bridged to Monaco output panel.
6. Stop button is inserted next to Run; clicking it calls `noLoop()` on the iframe p5 instance.

### 3. Non-p5 JavaScript flow

If code does not match p5 detection, runner delegates to Slidev's JS runner when available.
If no delegate is available, a local fallback path executes JavaScript directly (`eval`) with console capture.

## Messaging Contract

Messages emitted from iframe include:
- `p5-iframe-ready`
- `p5-resize`
- `p5-error` (or structured error payloads routed by handler)

Handler behavior:
- validates origin,
- routes by message type,
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
- Iframe container content is reset between executions.
- `safeRemoveP5` / `safeRemoveElement` are used to avoid double-removal and cross-realm teardown issues.
- Unmount removes message listeners and component-level resources.

## Version Loading

`setup/p5-version-manager.ts` supports pinned versions and custom CDN URLs.

Precedence:
1. `p5CdnUrl` prop (highest)
2. `p5Version` prop
3. default latest supported version

## Testing and CI

- Unit tests: `tests/unit` (Vitest)
- E2E tests: `tests/e2e` (Playwright)
- CI workflow: `.github/workflows/ci.yml` runs lint + unit + E2E

## Current Constraints

- p5 detection is heuristic (`setup()`-based), not a full semantic classifier.
- First run can race iframe/library readiness in some environments.
- Non-p5 fallback still contains a direct-eval path when runner delegation is unavailable.

## Practical Extension Points

- Improve p5 detection signal beyond `setup()` regex.
- Remove/replace non-p5 `eval` fallback path.
- Expand tests for race conditions around iframe readiness and sketch ID pairing.
- Add additional documented examples for custom p5 source loading patterns.
