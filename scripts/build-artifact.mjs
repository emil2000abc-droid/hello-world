// Turns the Vite build in dist/ into one self-contained HTML page for
// publishing as a claude.ai artifact (CSS and JS inlined).
// Usage: node scripts/build-artifact.mjs <output.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2] ?? 'dist/resonix-artifact.html';
const html = readFileSync('dist/index.html', 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`asset not found: ${re}`);
  return readFileSync(join('dist', m[1].replace(/^\.\//, '')), 'utf8');
};
const css = asset(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
// Keep inline script data from closing the tag or opening an HTML comment.
const js = asset(/<script type="module"[^>]*src="([^"]+)"/).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const page = `<title>Resonix Studio</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<style>
/* Artifact shell: the app is one dark screen inside the host's safe-area padding. */
:root {
  color-scheme: dark;
  --safe-area-inset-top: 0px;
  --safe-area-inset-right: 0px;
  --safe-area-inset-bottom: 0px;
  --safe-area-inset-left: 0px;
}
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  padding-block: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(out, page);
console.log(`artifact page: ${out} (${(page.length / 1024).toFixed(0)} KB)`);
