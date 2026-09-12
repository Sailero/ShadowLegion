// Re-encode opaque original artwork for delivery. No resizing or content edits.
const { nativeImage, app } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
for (const name of ['journey-keyart', 'terrain-atlas']) {
  const original = nativeImage.createFromBuffer(readFileSync(resolve('art/source', `${name}.png`)));
  if (original.isEmpty()) throw new Error(`Cannot decode artwork: ${name}`);
  const bytes = original.toJPEG(92);
  writeFileSync(resolve('src/public/art', `${name}.jpg`), bytes);
  console.log(`${name}: ${bytes.length} bytes, original dimensions preserved`);
}
app.exit(0);
