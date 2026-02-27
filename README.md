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

- Threat model: trusted-only slide content. This addon assumes the slide author controls code fences passed to `<P5Canvas>` / `<P5Code>`.
- p5 snippets are detected with AST-based signals (lifecycle hooks, `new p5(...)`, and common p5 sketch calls) with regex fallback if parsing fails.
- Runner execution waits briefly for iframe-local p5 to finish loading before returning a not-ready error.
- Keep code inside `<P5Canvas>` or `<P5Code>` slots for correct extraction/execution.
- Non-p5 code is delegated to Slidev's JS runner when available. If unavailable, the addon returns an error instead of executing code locally.
- Iframe messages are validated by origin and source window, and are scoped by `sketchInstanceId`.
- Iframe runtime errors are surfaced in the inline error boundary and also recorded in the iframe logs panel.
- Iframe preview background follows Slidev theme toggles live (including `d` dark/light switch during slideshow).

- Permissions (camera & microphone): the preview iframes are created with `allow="camera; microphone; autoplay; display-capture"` so sketches can call `navigator.mediaDevices.getUserMedia()` when needed. Browsers require a secure context (HTTPS) or `localhost` to grant media device access; users must grant permission in the browser UI. Serving slides over `file://` or plain HTTP will prevent getUserMedia from working.
- Troubleshooting: if you see `ReferenceError: VIDEO is not defined`, upgrade to a version that includes p5 constant transpilation for `VIDEO`/`AUDIO` in instance mode.

## Understanding iframe error logs

`<P5Code>` still sends normal `console.log()`/`print()` output to Slidev's Monaco console panel.  
The iframe `Logs` panel is reserved for iframe runtime errors and stays hidden unless an error is received.

Common iframe errors and what to do:

- `ReferenceError: VIDEO is not defined`
  - Meaning: an older addon/runtime build is still being served and media constants were not transpiled to instance mode.
  - Action: restart Slidev, hard-refresh the browser, and make sure you are on a build that includes the `VIDEO`/`AUDIO` transpilation fix.
- `NotAllowedError`
  - Meaning: browser denied camera/microphone permission.
  - Action: allow camera/microphone for the site in browser permissions and re-run.
- `NotFoundError`
  - Meaning: no camera/microphone device was found.
  - Action: connect/enable a device and re-run.
- `NotReadableError`
  - Meaning: device exists but is busy/unavailable.
  - Action: close other apps/tabs using the device and re-run.
- `SecurityError` or `navigator.mediaDevices` missing
  - Meaning: page is not in a secure context.
  - Action: use `https://` or `localhost` (not `file://` or plain remote `http://`).

## Camera example (use `createCapture`)

Use p5's `createCapture()` instead of calling `getUserMedia()` directly — this ensures the sketch runs in p5's instance mode and is cleaned up correctly. Wrap the code in a `<P5Canvas>` or `<P5Code>` block so it runs inside the iframe.

<P5Canvas>
```js
let cam;
function setup() {
  createCanvas(320, 240);
  cam = createCapture(VIDEO);
  cam.size(320, 240);
  cam.hide();
}

function draw() {
  background(0);
  if (cam) image(cam, 0, 0, width, height);
}
```
</P5Canvas>
## TODO

- Add an example of including p5.js as an imported code snippet.

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
