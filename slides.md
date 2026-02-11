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
}
<span style="color:#b42318;">function</span> <span style="color:#065f46;">draw</span>() {
  <span style="color:#065f46;">background</span>(<span style="color:#1d4ed8;">220</span>);
  <span style="color:#065f46;">circle</span>(<span style="color:#7c3aed;">mouseX</span>, <span style="color:#7c3aed;">mouseY</span>, <span style="color:#1d4ed8;">40</span>);
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

# Tip — Constrain long `<P5Code>` blocks

<div v-click>
Long sketches can overflow vertically in the editor pane.
</div>

<div v-click>
Set an explicit editor height in the code fence to keep layout stable:
</div>

<pre style="padding: 0.8rem 1rem; border-radius: 10px; background: #f6f6f7; color: #1f2937; font-size: 0.88rem; line-height: 1.5; white-space: pre-wrap; overflow: auto;"><code><span style="color:#b42318;">&lt;P5Code&gt;</span>
<span style="color:#6b7280;">```js {monaco-run}{autorun:false,height:'40vh'}</span>
<span style="color:#6b7280;">// long sketch...</span>
<span style="color:#b42318;">function</span> <span style="color:#065f46;">setup</span>() { <span style="color:#065f46;">createCanvas</span>(<span style="color:#1d4ed8;">400</span>, <span style="color:#1d4ed8;">400</span>) }
<span style="color:#b42318;">function</span> <span style="color:#065f46;">draw</span>() { <span style="color:#065f46;">background</span>(<span style="color:#1d4ed8;">20</span>) }
<span style="color:#6b7280;">```</span>
<span style="color:#b42318;">&lt;/P5Code&gt;</span></code></pre>

<div v-click class="mt-4 opacity-90">
Use `height:'40vh'` (or another value) when your code block is long.
</div>

---

# Summary

- `<P5Canvas>` displays sketches without showing code
- `<P5Code>` provides a Monaco editor with a Run button
- Console output is captured in the editor panel
- Input is isolated via iframe for reliable mouse/keyboard interaction
- Works with standard Slidev addon installation
