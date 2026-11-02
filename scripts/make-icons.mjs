// Renders the Loopify mark to the PNG sizes a PWA needs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const gradient = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4a6cf7"/>
      <stop offset="1" stop-color="#2b3fd0"/>
    </linearGradient>
  </defs>`;

// Ring, arrow and envelope on the 336 x 336 grid (same artwork as src/app/icon.svg).
const glyph = `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M237 126 A80 80 0 1 1 168 86" stroke="#fff" stroke-width="26"/>
    <path d="M178 56 L212 86 L178 116" stroke="#fff" stroke-width="24"/>
    <rect x="118" y="131" width="100" height="66" rx="14" stroke="#19d3c0" stroke-width="13"/>
    <path d="M128 145 L168 174 L208 145" stroke="#19d3c0" stroke-width="12"/>
  </g>`;

/** rounded: tile with rounded corners (any-purpose icons). Otherwise a full-bleed square. */
const svg = ({ rounded, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336 336">
  ${gradient}
  <rect width="336" height="336" ${rounded ? 'rx="76"' : ""} fill="url(#g)"/>
  <g transform="translate(168 168) scale(${scale}) translate(-168 -168)">${glyph}</g>
</svg>`;

const targets = [
  { file: "public/icons/icon-192.png", size: 192, rounded: true, scale: 1 },
  { file: "public/icons/icon-512.png", size: 512, rounded: true, scale: 1 },
  // Maskable icons keep the artwork inside the central safe zone.
  { file: "public/icons/icon-maskable-512.png", size: 512, rounded: false, scale: 0.72 },
  // iOS rounds the corners itself, so the touch icon is a full-bleed square.
  { file: "public/icons/apple-touch-icon.png", size: 180, rounded: false, scale: 0.92 },
];

for (const { file, size, rounded, scale } of targets) {
  await sharp(Buffer.from(svg({ rounded, scale }))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
