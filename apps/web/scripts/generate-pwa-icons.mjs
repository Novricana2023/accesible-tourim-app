/**
 * Generates PNG PWA icons from public/favicon.svg (run before production build).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const outDir = path.join(root, "public", "pwa");

const sizes = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
];

async function renderIcon(svg, size, maskable) {
  const canvas = maskable ? Math.round(size * 1.25) : size;
  const iconSize = maskable ? Math.round(size * 0.72) : size;
  const offset = Math.round((canvas - iconSize) / 2);
  const inner = await sharp(svg).resize(iconSize, iconSize).png().toBuffer();
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: maskable ? { r: 12, g: 92, b: 110, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, left: offset, top: offset }])
    .resize(size, size)
    .png()
    .toBuffer();
}

const svg = await readFile(svgPath);
await mkdir(outDir, { recursive: true });

for (const { name, size, maskable } of sizes) {
  const png = await renderIcon(svg, size, maskable);
  await writeFile(path.join(outDir, name), png);
}

console.log(`Wrote ${sizes.length} icons to public/pwa/`);
