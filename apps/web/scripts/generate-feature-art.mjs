import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "public", "features");

const art = {
  vision: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c5c6e"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
  <rect width="400" height="400" rx="32" fill="#e0f2f6"/>
  <circle cx="200" cy="200" r="120" fill="url(#g)" opacity="0.15"/>
  <ellipse cx="200" cy="205" rx="95" ry="58" fill="none" stroke="url(#g)" stroke-width="14"/>
  <circle cx="200" cy="205" r="28" fill="url(#g)"/>
  <path d="M120 130 Q200 70 280 130" fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>
</svg>`,
  read: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c5c6e"/><stop offset="1" stop-color="#047857"/></linearGradient></defs>
  <rect width="400" height="400" rx="32" fill="#ecfdf5"/>
  <rect x="95" y="110" width="210" height="200" rx="12" fill="#fff" stroke="url(#g)" stroke-width="8"/>
  <rect x="120" y="150" width="160" height="12" rx="4" fill="#94a3b8"/>
  <rect x="120" y="178" width="140" height="12" rx="4" fill="#64748b"/>
  <rect x="120" y="206" width="150" height="12" rx="4" fill="#64748b"/>
  <rect x="120" y="234" width="100" height="12" rx="4" fill="#94a3b8"/>
  <path d="M260 280 L310 330 L350 290" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  navigate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c5c6e"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>
  <rect width="400" height="400" rx="32" fill="#fffbeb"/>
  <circle cx="200" cy="210" r="100" fill="none" stroke="#fcd34d" stroke-width="6"/>
  <path d="M200 120 L200 240 M200 120 L165 175 M200 120 L235 175" fill="none" stroke="url(#g)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="200" cy="210" r="16" fill="url(#g)"/>
</svg>`,
  sign: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c5c6e"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
  <rect width="400" height="400" rx="32" fill="#eff6ff"/>
  <path d="M130 280 C130 180 170 120 200 120 C230 120 270 180 270 280" fill="none" stroke="url(#g)" stroke-width="16" stroke-linecap="round"/>
  <circle cx="155" cy="200" r="14" fill="url(#g)"/>
  <circle cx="245" cy="200" r="14" fill="url(#g)"/>
  <path d="M200 250 L200 310 M200 250 L170 290 M200 250 L230 290" fill="none" stroke="url(#g)" stroke-width="12" stroke-linecap="round"/>
</svg>`,
};

await mkdir(outDir, { recursive: true });
for (const [name, svg] of Object.entries(art)) {
  const width = 400;
  const height = 400;
  const png = await sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
  await writeFile(path.join(outDir, `${name}.png`), png);
}
console.log(`Wrote ${Object.keys(art).length} feature images to public/features/`);
