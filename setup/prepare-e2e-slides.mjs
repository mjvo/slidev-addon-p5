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

const e2eSmokeSlide = `
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
`;

const out = src.replace(frontmatterMatch[0], `---\n${updatedFrontmatter}\n---\n`) + e2eSmokeSlide;
await writeFile(targetPath, out, 'utf8');
