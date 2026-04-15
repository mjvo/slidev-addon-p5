---
title: slidev-addon-p5 — Getting Started
addons:
  - ./
---

# slidev-addon-p5

A quick intro to using p5.js inside Slidev with **P5Canvas** and **P5Code**.

---

# Feature 1 — `<P5Canvas>` (display-only)

`<P5Canvas>` renders the sketch output directly on the slide, without showing the code.  
Use it to embed sketches as visual elements in your deck.

<P5Canvas>
```js
function setup() {
  createCanvas(375, 375);
  noStroke();
}

function draw() {
  // Draw a translucent background to create the trailing effect
  background(20, 20, 20, 25);

  // Draw the circle at mouse position
  fill(0, 255, 255);
  circle(mouseX, mouseY, 30);
}
```
</P5Canvas>

---

# Feature 2 — `<P5Code>` (interactive editor)

`<P5Code>` creates a two-column layout with a [Monaco Runner Editor](https://sli.dev/features/monaco-run) on the left.
Click the **Run** button to instantiate the sketch in the iframe on the right.

<P5Code>
```js {monaco-run}{autorun:false}
function setup() {
  createCanvas(375, 375);
  noStroke();
}

function draw() {
  // Draw a translucent background to create the trailing effect
  background(20, 20, 20, 25);

  // Draw the circle at mouse position
  fill(0, 255, 255);
  circle(mouseX, mouseY, 30);
}
```
</P5Code>

---

# Feature 3 — Console output in `<P5Code>`

Logs written with `console.log()` or p5.js `print()` appear in the console panel
at the bottom of the Monaco Runner Editor.

<P5Code>
```js {monaco-run}{autorun:false,height:'40vh'}
function setup() {
  createCanvas(320, 200);
  print('p5 print(): sketch initialized');
  console.log('console.log(): ready');
}
function draw() {
  background(30);
  drawArrow();
  fill(255);
  text('Look at the console below the code editor', 10, 30);
}
function drawArrow(){
   // Direction cue: arrow from near top-center toward bottom-left
  const sx = width / 2;
  const sy = 50;
  const ex = 65;
  const ey = height - 45;
  stroke(255, 220, 80);
  strokeWeight(3);
  line(sx, sy, ex, ey);
  const ang = atan2(ey - sy, ex - sx);
  noStroke();
  fill(255, 220, 80);
  triangle(
    ex,
    ey,
    ex - 14 * cos(ang - PI / 7),
    ey - 14 * sin(ang - PI / 7),
    ex - 14 * cos(ang + PI / 7),
    ey - 14 * sin(ang + PI / 7)
  );
}
```
</P5Code>

---

# Feature 4 — Input isolation via iframe

`<P5Code>` and `<P5Canvas>` run sketches in an **iframe**, isolating mouse and
keyboard input from Slidev and from the Monaco editor. This keeps interactions
predictable for sketches that need direct input.

The canvas is focused when you click on the Monaco editor's Run button, so you can immediately interact with the sketch.

<P5Code>
```js {monaco-run}{autorun:false,height:'40vh'}
let bubbles = [];

class Bubble {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
  }
  draw() {
    noStroke();
    fill(120, 200, 255, 180);
    circle(this.x, this.y, this.r * 2);
  }
  contains(mx, my) {
    return dist(mx, my, this.x, this.y) < this.r;
  }
}

function setup() {
  createCanvas(400, 260);
}

function draw() {
  background(20);
  for (const b of bubbles) b.draw();
  fill(200);
  text('Press 1-9 to add bubbles, click to remove', 10, height - 10);
}

function keyPressed() {
  if (key >= '1' && key <= '9') {
    const n = Number(key);
    for (let i = 0; i < n; i++) {
      const r = random(10, 30);
      bubbles.push(new Bubble(random(r, width - r), random(r, height - r), r));
    }
  }
}

function mousePressed() {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    if (bubbles[i].contains(mouseX, mouseY)) {
      bubbles.splice(i, 1);
      break;
    }
  }
}
```
</P5Code>

---

## Webcam with `createCapture()` in `<P5Code>`

Use p5's `createCapture()` inside a `<P5Code>` so the iframe can request camera access.

<P5Code>

```js {monaco-run}{autorun:false}
let cam;
function setup() {
  createCanvas(320, 240);
  cam = createCapture(VIDEO);
  cam.size(320, 240);
  cam.hide();
}

function draw() {
  background(0);
  fill(255);
  text('Waiting for webcam...', 10, 20);
  if (cam) image(cam, 0, 0, width, height);
}
```

</P5Code>

---

## Feature 5 — Opt-in `p5.sound` in `<P5Code>`

`p5.sound` is disabled by default. Enable it per sketch with `:enable-p5-sound="true"`.

<P5Code :enable-p5-sound="true">

```js {monaco-run}{autorun:false,height:'38vh'}
const AUDIO_URL = 'audio/loop.mp3';
const FFT_BINS = 64;
let song;
let fft;
let status = 'Click Run to load audio';

const GAIN = 26 // p5 sound is quiet, boost it for better visualization;

async function setup() {
  createCanvas(420, 180);
  status = `Loading ${AUDIO_URL} ...`;
  try {
     song = await loadSound(AUDIO_URL);
    song.play();
    song.loop();
    fft = new p5.FFT(FFT_BINS);
    song.connect(fft);                // keep your routing
    status = 'Playing loop.mp3 (FFT bars below)';
  } catch (err) {
    status = `Audio load failed: ${String(err)}`;
  }
}

function draw() {
  background(12, 16, 24);
  fill(230);
  noStroke();
  text(status, 12, 20);

  if (!fft) return;

  const spectrum = fft.analyze(FFT_BINS);
  const barW = width / spectrum.length;
  const barPixelW = max(1, barW - 1);

  for (let i = 0; i < spectrum.length; i++) {
    const v = constrain(spectrum[i] * GAIN, 0, 1); // visual gain
    const h = max(2, v * (height - GAIN));         // minimum visible bar
    const t = spectrum.length > 1 ? i / (spectrum.length - 1) : 0;
    fill(`hsla(${t * 240}, 100%, 55%, 0.9)`);    
    rect(i * barW, height - h - 6, barPixelW, h);
  }
}
```

</P5Code>

---

## Feature 6a — External p5 libs in global mode

This example implements the [ml5js](https://ml5js.org/) library via CDN using the `:external-p5-libs` prop. Most external libraries can be implemented in global mode. If a library needs to be configured in instance mode, you can do that in the sketch code (see next slide for the p5.grain example).

<P5Code :external-p5-libs="['https://unpkg.com/ml5@1/dist/ml5.js']">

```js {monaco-run}{autorun:false,height:'46vh'}
let video;
let handPose;
let hands = [];

function gotHands(results) {
  hands = results;
}

async function setup() {
  createCanvas(400, 300);

  video = createCapture(VIDEO, { flipped: true });
  video.size(width, height);
  video.hide();

  handPose = await ml5.handPose({ flipped: true });
  handPose.detectStart(video, gotHands);
}

function draw() {
  background(0);
  image(video, 0, 0, width, height);

  for (const hand of hands) {
    for (const keypoint of hand.keypoints) {
      fill(0, 255, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 10);
    }

    const thumb = hand.keypoints[4];
    const indexFinger = hand.keypoints[8];
    stroke(0, 255, 255);
    strokeWeight(4);
    line(thumb.x, thumb.y, indexFinger.x, indexFinger.y);
  }
}
```

</P5Code>

---

## Feature 6b — External p5 libs in instance mode

In this `:external-p5-libs` example, the [`p5.grain`](https://github.com/josephmiclaus/p5.grain) library needs to be implemented in "instance" mode.

<P5Code :external-p5-libs="['https://cdn.jsdelivr.net/npm/p5.grain/dist/p5.grain.min.js']">

```js {monaco-run}{autorun:false,height:'40vh'}
function setup() {
  createCanvas(400, 400);
  // slidev-addon-p5 runs sketches in p5 instance mode, so configure
  // p5.grain against the current sketch instance rather than global mode.
  p5grain.setup({ instance: this, random: this.random.bind(this) });
  background(255);
  noStroke();
  fill(100, 100, 240);
  circle(width / 2, height / 2, min(width, height) / 2);

  this.applyMonochromaticGrain(42);
}
```
</P5Code>

---

## Feature 7a — Import a snippet in `<P5Canvas>`

Use Slidev's snippet include syntax to load sketch code from a file:

<P5Canvas>

<<< @/snippets/file-name-sketch.js js

</P5Canvas>

---

## Feature 8b — Import a snippet in `<P5Code>`

You can do the same in Monaco runner blocks:

<P5Code>

<<< @/snippets/write-every-pixel.js js {monaco-run}{autorun:false}

</P5Code>

---

## Compatibility — standard Monaco JavaScript still works

The addon should not interfere with Slidev's built-in Monaco JavaScript runner.

```js {monaco-run}{autorun:false}
console.log('plain-js-ok')
```

---

# Install the addon

Add to `slides.md` frontmatter:

```yaml
---
addons:
  - slidev-addon-p5
---
```

Or add to `package.json`:

```json
"slidev": {
  "addons": [
    "slidev-addon-p5"
  ]
}
```

---

# Component syntax — `<P5Canvas>`

Use `<P5Canvas>` for display-only sketches:

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Canvas&gt;</span>
<span style="color:#6b7280;">```js</span>
<span style="color:#b42318;">function</span> <span style="color:#065f46;">setup</span>() {
  <span style="color:#065f46;">createCanvas</span>(<span style="color:#1d4ed8;">400</span>, <span style="color:#1d4ed8;">400</span>);
  <span style="color:#065f46;">background</span>(<span style="color:#1d4ed8;">0</span>);
  <span style="color:#065f46;">circle</span>(<span style="color:#1d4ed8;">200</span>, <span style="color:#1d4ed8;">200</span>, <span style="color:#1d4ed8;">20</span>);
}
<span style="color:#6b7280;">```</span>
<span style="color:#b42318;">&lt;/P5Canvas&gt;</span></code></pre>

---

# Component syntax — `<P5Code>`

Use `<P5Code>` for an interactive editor + live preview:
**Important:** the code fence must include `{monaco-run}{autorun:false}` so the Run button appears and execution is opt‑in.

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Code&gt;</span>
<span style="color:#6b7280;">```js {monaco-run}{autorun:false}</span>
<span style="color:#b42318;">function</span> <span style="color:#065f46;">setup</span>() {
  <span style="color:#065f46;">createCanvas</span>(<span style="color:#1d4ed8;">400</span>, <span style="color:#1d4ed8;">400</span>);
}
<span style="color:#b42318;">function</span> <span style="color:#065f46;">draw</span>() {
  <span style="color:#065f46;">background</span>(<span style="color:#1d4ed8;">20</span>);
  <span style="color:#065f46;">fill</span>(<span style="color:#1d4ed8;">0</span>, <span style="color:#1d4ed8;">255</span>, <span style="color:#1d4ed8;">255</span>);
  <span style="color:#065f46;">circle</span>(<span style="color:#7c3aed;">mouseX</span>, <span style="color:#7c3aed;">mouseY</span>, <span style="color:#1d4ed8;">30</span>);
}
<span style="color:#6b7280;">```</span>
<span style="color:#b42318;">&lt;/P5Code&gt;</span></code></pre>

---

# Component syntax — Snippet import in `<P5Canvas>`

Use Slidev snippet import syntax inside the component body:

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Canvas&gt;</span>
<span style="color:#6b7280;">&lt;&lt;&lt; @/snippets/file-name-sketch.js js</span>
<span style="color:#b42318;">&lt;/P5Canvas&gt;</span></code></pre>

---

# Component syntax — Snippet import in `<P5Code>`

For Monaco runner, include runner attributes on the snippet line:

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Code&gt;</span>
<span style="color:#6b7280;">&lt;&lt;&lt; @/snippets/write-every-pixel.js js {monaco-run}{autorun:false}</span>
<span style="color:#b42318;">&lt;/P5Code&gt;</span></code></pre>

---

# Tip — Constrain long `<P5Code>` blocks

Long sketches can overflow vertically in the editor pane.

Set an explicit editor height in the code fence to keep layout stable:

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Code&gt;</span>
<span style="color:#6b7280;">```js {monaco-run}{autorun:false,height:'40vh'}</span>
<span style="color:#6b7280;">// long sketch...</span>
<span style="color:#b42318;">function</span> <span style="color:#065f46;">setup</span>() { <span style="color:#065f46;">createCanvas</span>(<span style="color:#1d4ed8;">400</span>, <span style="color:#1d4ed8;">400</span>) }
<span style="color:#b42318;">function</span> <span style="color:#065f46;">draw</span>() { <span style="color:#065f46;">background</span>(<span style="color:#1d4ed8;">20</span>) }
<span style="color:#6b7280;">```</span>
<span style="color:#b42318;">&lt;/P5Code&gt;</span></code></pre>


<div v-click>
Use `height:'40vh'` (or another value) when your code block is long.
</div>

---

# Summary

- `<P5Canvas>` displays sketches without showing code
- `<P5Code>` provides a Monaco editor with a Run button
- Console output is captured in the editor panel
- Input is isolated via iframe for reliable mouse/keyboard interaction
- Works with standard Slidev addon installation
