Contributing
============

Thanks for contributing! This document explains how to run tests locally, debug failing Playwright E2E tests, and capture artifacts useful for CI debugging.

Reporting an issue
- Provide a short reproduction (slides.md or code snippet) and the commands you ran.
- Attach Playwright trace.zip and video.webm if you ran E2E locally.

Running tests locally
- Install the dependency graph recorded in `pnpm-lock.yaml`:

```bash
pnpm install --frozen-lockfile
```

- Lint:

```bash
pnpm run lint
```

- Run unit tests (fast):

```bash
pnpm run test:unit
```

- Install Playwright browsers (required for E2E):

```bash
pnpm exec playwright install --with-deps
```

- Run E2E tests (starts a local Slidev dev server automatically):

```bash
pnpm run test:e2e
```

- Run everything sequentially:

```bash
pnpm run test:all
```

Contributor guardrails
- Do not add local `eval` / `new Function` execution fallbacks for runner code paths.
- Keep iframe bootstrap HTML/theme/background logic centralized in `setup/iframe-bootstrap.ts` (avoid reintroducing duplicate inline bootstrap blocks).
- Iframe postMessage payloads should include `sketchInstanceId`, and handlers should remain scoped by source window + sketch ID.
- If you change message contracts (`p5-iframe-ready`, `p5-resize`, `p5-error`), update both component/runtime code and corresponding E2E tests in `tests/e2e/`.

Dependency updates
- Keep `pnpm-lock.yaml` committed. It records the transitive dependency versions used by development, CI, and demo verification.
- Use `pnpm install --frozen-lockfile` for ordinary development verification and release checks. Use a non-frozen install only when intentionally changing dependency resolution.
- When updating a dependency, inspect both `package.json` and `pnpm-lock.yaml` before committing. A narrow update should not silently refresh unrelated framework or tooling packages.
- Keep patch-release dependency changes focused. If the lockfile changes a broad Slidev/Vue/Vite toolchain graph while updating one small package, isolate the requested update or defer the larger refresh to separate maintenance work.
- For unexpected transitive changes, use `pnpm why <package>` and test the changed package behavior directly before accepting the lockfile diff.

Debugging Playwright E2E failures
- Reproduce with trace and headed mode to capture video and full trace:

```bash
pnpm exec playwright test --headed --trace=on
```

- Artifacts are written under `test-results/` per-test. To inspect a trace interactively:

```bash
pnpm exec playwright show-trace test-results/<test-folder>/trace.zip
```

- To open the HTML report of the last run:

```bash
pnpm exec playwright show-report
```

Common issues & tips
- Intermittent failures often stem from timing/race conditions between Slidev client mount and test actions. Use the helpers in tests such as `waitForP5IframeReady` which listen for the `p5-iframe-ready` postMessage emitted by the iframe host.
- If Playwright cannot find UI elements, run the failing test in headed mode and inspect `video.webm` to see what the browser saw.
- When adding new E2E tests, prefer using the existing helpers (`clickRunButton`, `waitForP5CanvasInFrame`) to reduce flakiness.

CI notes
- The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that installs with `--frozen-lockfile`, then runs lint, typecheck, unit tests, Playwright E2E, package-content verification, and a demo build smoke check on pushes and PRs.
- On failure, the workflow uploads Playwright artifacts found under `test-results/` to the run as an artifact for offline inspection.
