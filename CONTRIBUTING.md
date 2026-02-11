Contributing
============

Thanks for contributing! This document explains how to run tests locally, debug failing Playwright E2E tests, and capture artifacts useful for CI debugging.

Reporting an issue
- Provide a short reproduction (slides.md or code snippet) and the commands you ran.
- Attach Playwright trace.zip and video.webm if you ran E2E locally.

Running tests locally
- Install dependencies:

```bash
pnpm install
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
- The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs lint, unit tests, and Playwright E2E on pushes and PRs.
- On failure, the workflow uploads Playwright artifacts found under `test-results/` to the run as an artifact for offline inspection.
