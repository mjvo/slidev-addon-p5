# slidev-addon-p5

[![CI](https://github.com/mjvo/slidev-addon-p5/actions/workflows/ci.yml/badge.svg)](https://github.com/mjvo/slidev-addon-p5/actions)
[Live Demo](https://mjvo.github.io/slidev-addon-p5)

`slidev-addon-p5` adds p5.js sketch support to Slidev with iframe-isolated execution and Monaco Run integration.

## Demo

- Live Slides Demo: [https://mjvo.github.io/slidev-addon-p5](https://mjvo.github.io/slidev-addon-p5)

## What it provides

- `<P5Canvas>`: render a sketch from a fenced code block (display-focused).
- `<P5Code>`: Monaco editor + Run button + live iframe preview.
- Iframe execution for reliable mouse/keyboard input.
- Global-mode-to-instance-mode transpilation for safer reruns.
- Console bridge to Monaco output (`log`, `warn`, `error`).
- Stop button next to Run (`noLoop()`).
- Per-sketch p5 loading via version or custom CDN URL.

## Install

```bash
pnpm add slidev-addon-p5
```

Add to Slidev frontmatter:

```yaml
---
addons:
  - slidev-addon-p5
---
```

For local addon development in this repo, use:

```yaml
---
addons:
  - ./
---
```

## Usage

### `<P5Canvas>` (display-focused)

````md
<P5Canvas>
```js
function setup() {
  createCanvas(400, 400);
}
function draw() {
  background(220);
  circle(mouseX, mouseY, 40);
}
```
</P5Canvas>
````

### `<P5Code>` (interactive Monaco + preview)

Use Slidev Monaco runner attributes so a Run button is available:

````md
<P5Code>
```js {monaco-run}{autorun:false}
function setup() {
  createCanvas(400, 400);
}
function draw() {
  background(20);
  fill(0, 255, 255);
  circle(mouseX, mouseY, 30);
}
```
</P5Code>
````

### Optional p5 source control

`p5Version` chooses a supported version. `p5CdnUrl` overrides version selection.

````md
<P5Canvas :p5-version="'2.1.0'">
```js
function setup() { createCanvas(300, 300); }
```
</P5Canvas>
````

````md
<P5Canvas :p5-cdn-url="'https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js'">
```js
function setup() { createCanvas(300, 300); }
```
</P5Canvas>
````

## Notes and limits

- p5 snippets are detected via `setup()` patterns in the code runner path.
- If p5 in an iframe is still loading, first Run can fail; run again once ready.
- Keep code inside `<P5Canvas>` or `<P5Code>` slots for correct extraction/execution.

## TODO

- Add an example of including p5.js as an imported code snippet.
- Investigate/resolve Vite circular chunk warning involving Monaco + Shiki (`monaco/bundled-types` ↔ `modules/shiki`) to reduce bundle risk.
- Rework non-p5 runner fallback in `setup/code-runners.ts` to remove direct `eval` usage (or document the threat model more explicitly).

## Contributing (developers)

Short workflow:

```bash
pnpm install
pnpm run lint
pnpm run test:unit
pnpm exec playwright install --with-deps
pnpm run test:e2e
```

Key files:

- Runtime runner: `setup/code-runners.ts`
- Components: `components/P5Canvas.vue`, `components/P5Code.vue`
- Transpiler: `setup/p5-transpile.ts`
- Message/resize handlers: `setup/iframe-message-handler.ts`, `setup/iframe-resize-handler.ts`

See:

- `CONTRIBUTING.md` for contribution and debugging guidance.
- `TESTING.md` for test commands and Playwright artifact usage.
- `ARCHITECTURE.md` for deeper implementation details.

## License

MIT
