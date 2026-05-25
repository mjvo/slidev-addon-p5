import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, 'slides.md');
const targetPath = path.join(rootDir, 'slides.e2e.md');
const addonPath = rootDir.replace(/\\/g, '/');

const src = await readFile(sourcePath, 'utf8');

const frontmatterMatch = src.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatterMatch) {
  throw new Error('slides.md is missing frontmatter; cannot inject addon path for e2e.');
}

const frontmatter = frontmatterMatch[1];
const updatedFrontmatter = frontmatter.replace(
  /addons:\s*\n\s*-\s*\.\/\s*/m,
  `addons:\n  - ${addonPath}\n`
);

if (updatedFrontmatter === frontmatter) {
  throw new Error('slides.md frontmatter missing "addons: - ./" entry; cannot inject addon path for e2e.');
}

const e2eSmokeSlides = `
---

## E2E external-p5-libs smoke

<P5Code :external-p5-libs="['/external-p5-libs-smoke.js']">

\`\`\`js {monaco-run}{autorun:false,height:'34vh'}
function setup() {
  createCanvas(260, 140);
  externalP5LibSmoke.drawBadge(this, 'external-p5-libs ok');
  noLoop();
}
\`\`\`

</P5Code>

---

## E2E keyboard focus smoke

<P5Code>

\`\`\`js {monaco-run}{autorun:false,height:'34vh'}
let value = 0;

function setup() {
  createCanvas(260, 140);
  textSize(20);
}

function draw() {
  background(24);
  fill(255);
  text('keys: ' + value, 20, 70);
}

function keyPressed() {
  value += 1;
}
\`\`\`

</P5Code>

---

## E2E theme sync smoke

<P5Canvas>
\`\`\`js
function setup() {
  createCanvas(220, 120);
  noLoop();
}

function draw() {
  background(60, 120, 210);
  fill(255);
  text('theme sync', 20, 60);
}
\`\`\`
</P5Canvas>

---

## E2E multi sketch routing smoke

<P5Code>

\`\`\`js {monaco-run}{autorun:false,height:'28vh'}
function setup() {
  createCanvas(160, 90);
  background(220, 40, 40);
  noLoop();
}
\`\`\`

</P5Code>

<P5Code>

\`\`\`js {monaco-run}{autorun:false,height:'28vh'}
function setup() {
  createCanvas(210, 110);
  background(40, 90, 220);
  noLoop();
}
\`\`\`

</P5Code>
`;

const out = src.replace(frontmatterMatch[0], `---\n${updatedFrontmatter}\n---\n`) + e2eSmokeSlides;
await writeFile(targetPath, out, 'utf8');
