import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, 'slides.md');
const targetPath = path.join(rootDir, 'slides.dev.md');
const addonPath = rootDir.replace(/\\/g, '/');

const src = await readFile(sourcePath, 'utf8');

const frontmatterMatch = src.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatterMatch) {
  throw new Error('slides.md is missing frontmatter; cannot inject addon path for dev.');
}

const frontmatter = frontmatterMatch[1];
const updatedFrontmatter = frontmatter.replace(
  /addons:\s*\n\s*-\s*\.\/\s*/m,
  `addons:\n  - ${addonPath}\n`
);

if (updatedFrontmatter === frontmatter) {
  throw new Error('slides.md frontmatter missing "addons: - ./" entry; cannot inject addon path for dev.');
}

const out = src.replace(frontmatterMatch[0], `---\n${updatedFrontmatter}\n---\n`);
await writeFile(targetPath, out, 'utf8');
