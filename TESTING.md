Testing guide — slidev-addon-p5

This document describes how to run and debug the project's test suites locally.

Test layout
- Unit tests: `tests/unit/` — run with `vitest`.
- E2E tests: `tests/e2e/` — run with `@playwright/test` against a local Slidev dev server.
- Detection and readiness regressions:
  - `tests/unit/code-runners.spec.ts` covers `isLikelyP5Sketch` classification.
  - `tests/unit/code-runners.spec.ts` also verifies that non-p5 JavaScript still delegates to Slidev's original Monaco runner after addon setup.
  - `tests/e2e/p5-runner-e2e.spec.ts` includes delayed-iframe-p5-load first-run coverage.
  - `tests/e2e/p5-runner-e2e.spec.ts` also includes a compatibility check asserting that a plain Monaco JavaScript block still prints to Slidev's standard runner output with the addon installed.
  - `tests/e2e/p5-runner-e2e.spec.ts` covers iframe keyboard focus, theme background sync, and routing when two `<P5Code>` sketches share one slide.
  - `tests/e2e/p5-canvas-lifecycle.spec.ts` covers `<P5Canvas>` activation-only startup, navigation teardown, sound stopping, and restart on return.
  - `tests/e2e/error-ui.spec.ts` validates iframe `p5-error` messages surface in UI.

NPM scripts
- `pnpm run test:unit` — runs Vitest against `tests/unit`.
- `pnpm run test:e2e` — runs Playwright E2E tests (starts Slidev server automatically).
- `pnpm run test:all` — runs unit tests then E2E tests sequentially.

Quick commands
```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run test:unit
pnpm exec playwright install --with-deps
pnpm run test:e2e
pnpm run test:all
```

Dependency and release verification
- Keep `pnpm-lock.yaml` committed and use `pnpm install --frozen-lockfile` when validating the checked-in dependency graph.
- Use a non-frozen install only for an intentional dependency update, then review the `package.json` and `pnpm-lock.yaml` diff together.
- For a patch release, reject unrelated broad lockfile churn unless it is separately scoped and validated as dependency maintenance.
- Before release, run a frozen-lockfile install followed by lint, typecheck, unit tests, package-content verification, demo build, and E2E coverage.

Playwright notes
- Playwright config: `playwright.config.ts` uses `testDir: 'tests/e2e'` and runs E2E tests serially by default (`fullyParallel: false`, `workers: 1`) to avoid shared-server interference. You can change `workers` if you isolate the server per worker.
- To run a single E2E file:
```bash
pnpm exec playwright test tests/e2e/my-test.spec.ts -g "test name substring"
```
- Useful targeted runs:
```bash
pnpm exec playwright test tests/e2e/p5-runner-e2e.spec.ts
pnpm exec playwright test tests/e2e/error-ui.spec.ts
```
- Run headed with trace and video for debugging:
```bash
pnpm exec playwright test --headed --trace=on
```
- Inspect traces and reports:
```bash
pnpm exec playwright show-trace test-results/<test-name>/trace.zip
pnpm exec playwright show-report
```

Artifacts
- Playwright stores artifacts in `test-results/` with `video.webm`, `trace.zip`, and `error-context.md` per test run.
- Use `show-trace` to open the trace viewer (interactive) and inspect DOM snapshots, network, and action timeline.

Debugging tips
- If E2E tests fail intermittently, try running tests serially (`workers: 1`) and inspect the `video.webm` for action timing.
- Use `--headed --trace=on` to capture traces when reproducing a failure locally.
- Use the helper commands in tests like `waitForP5IframeReady` (tests include a `p5-iframe-ready` postMessage handshake) to wait for iframe initialization in your debugging flow.

CI
- CI runs frozen-lockfile install, lint, typecheck, unit tests, Playwright E2E, package-content verification, and demo build smoke coverage. Ensure Playwright browsers are installed in CI using `pnpm exec playwright install --with-deps` or the platform-specific installer used by your CI environment.
