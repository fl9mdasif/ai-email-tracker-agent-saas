// Renders the app icon SVG to the PNG sizes a PWA needs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#5b4bdb"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <rect x="96" y="148" width="320" height="216" rx="28" fill="none" stroke="#fff" stroke-width="28"/>
    <path d="M108 168 256 280 404 168" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="396" cy="148" r="44" fill="#22c55e" stroke="#5b4bdb" stroke-width="16"/>
  </g>
</svg>`;

const targets = [
  { file: "public/icons/icon-192.png", size: 192, pad: 0 },
  { file: "public/icons/icon-512.png", size: 512, pad: 0 },
  { file: "public/icons/icon-maskable-512.png", size: 512, pad: 0.2 },
  { file: "public/icons/apple-touch-icon.png", size: 180, pad: 0 },
];

for (const { file, size, pad } of targets) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
