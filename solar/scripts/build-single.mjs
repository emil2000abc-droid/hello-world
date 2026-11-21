// Inline the Vite build into one HTML file.
//   node scripts/build-single.mjs <out.html>             full standalone document
//   node scripts/build-single.mjs <out.html> --artifact  body-only page for a claude.ai artifact
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'dist/solar.html', flag] = process.argv.slice(2);
const html = readFileSync('dist/index.html', 'utf8');
const read = (re) => readFileSync(join('dist', html.match(re)[1].replace(/^\.\//, '')), 'utf8');
const css = read(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
const js = read(/<script type="module"[^>]*src="([^"]+)"/).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">';

let page;
if (flag === '--artifact') {
  page = `<title>SOLAR</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>${css}</style>
<style>
/* Artifact shell: one dark look; the host pads :root for the system bars. */
:root { color-scheme: dark; }
html, body { background: #030304; color: #f2f3ee; }
</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
} else {
  page = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#040405">
<title>SOLAR — Explore the Solar System</title>
${fonts}
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>
`;
}
writeFileSync(out, page);
console.log(`${out} (${(page.length / 1024).toFixed(0)} KB)`);
