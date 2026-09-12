import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve('dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
assert.match(html, /<html[^>]+lang=["']zh-CN["']/i, 'The page must declare its supported language.');
assert.ok(!html.includes('main.ts'), 'Production HTML still references TypeScript source.');
let references = 0;
for (const [, reference] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  if (/^(?:https?:|data:|#)/.test(reference)) continue;
  assert.ok(!reference.startsWith('/'), `Root-relative URL breaks subdirectory hosting: ${reference}`);
  const target = resolve(root, reference.split(/[?#]/)[0]);
  assert.ok(target.startsWith(root + sep), `Asset path escapes the release: ${reference}`);
  assert.ok(statSync(target).isFile(), `Missing asset: ${reference}`);
  references++;
}
assert.ok(references > 0, 'No local production assets were found.');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
}
const all = files(root);
let total = 0;
let gzipJs = 0;
for (const path of all) {
  const name = relative(root, path);
  const content = readFileSync(path);
  total += content.length;
  assert.ok(!/(?:^|[\\/])(?:\.env|node_modules|test)(?:[.\\/]|$)/.test(name), `Private/development file in build: ${name}`);
  assert.ok(!name.endsWith('.map'), `Source map unexpectedly published: ${name}`);
  if (name.endsWith('.js')) {
    gzipJs += gzipSync(content).length;
    const text = content.toString('utf8');
    for (const marker of ['DATA TESTS', 'SCENE TESTS', 'attachScenarioTests', '__devTestsAttached']) {
      assert.ok(!text.includes(marker), `Development test hook in production JS: ${marker}`);
    }
  }
}
// Payload budgets are deliberately separate from FPS or load-time claims.
assert.ok(gzipJs <= 1_000_000, `Gzipped JS exceeds 1 MB: ${gzipJs}`);
assert.ok(total <= 20_000_000, `Static release exceeds 20 MB: ${total}`);
console.log(`Production package passed: ${all.length} files, ${(total / 1e6).toFixed(2)} MB raw, ${(gzipJs / 1e3).toFixed(1)} kB gzipped JS.`);
console.log('Relative assets verified; browser rendering, performance and usability require separate real-browser checks.');
