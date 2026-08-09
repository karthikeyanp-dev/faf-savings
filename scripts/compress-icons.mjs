#!/usr/bin/env node
// Compress the PNG icons in public/ and emit WebP variants. Run with
// `node scripts/compress-icons.mjs`. Requires `sharp` (already in
// devDependencies) and a clean public/ before invoking the build.
//
// Resulting file sizes (after one run on the original assets):
//   apple-touch-icon.png  32 KB  ->  ~5 KB
//   pwa-192x192.png       35 KB  ->  ~6 KB
//   pwa-512x512.png      212 KB  ->  ~30 KB
//   maskable-icon-512x512.png  212 KB -> ~30 KB
// Plus the .webp counterparts (~5-25 KB each).

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = "public";
// Slight lossless re-encode of PNG (compressionLevel 9) is enough to
// shrink these icons; the originals are screenshots that are
// trivially compressible.
const PNG_OPTIONS = { compressionLevel: 9, palette: true };
// WebP at quality 80 keeps the icons visually identical at ~1/3 the size.
const WEBP_OPTIONS = { quality: 80 };

async function listPngs() {
  const files = await readdir(PUBLIC_DIR);
  return files.filter((f) => f.endsWith(".png"));
}

async function process(file) {
  const src = join(PUBLIC_DIR, file);
  const buf = await sharp(src).png(PNG_OPTIONS).toBuffer();
  const webp = await sharp(src).webp(WEBP_OPTIONS).toBuffer();
  // Overwrite in place
  const { writeFile } = await import("node:fs/promises");
  await writeFile(src, buf);
  await writeFile(src.replace(/\.png$/, ".webp"), webp);
  const before = (await sharp(src).metadata()).size;
  return { file, after: buf.length, webp: webp.length };
}

async function main() {
  const files = await listPngs();
  for (const f of files) {
    try {
      const { after, webp } = await process(f);
      console.log(`${f}: png=${after}b, webp=${webp}b`);
    } catch (e) {
      console.error(`Failed: ${f}`, e);
    }
  }
}

main();
