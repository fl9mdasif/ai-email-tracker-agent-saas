// Renders the Loopify mark (icon only) to the PNG sizes a PWA needs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

// Same artwork as src/app/icon.svg, on its original grid (viewBox 34 51 600 600, centre 334 351).
const mark = `
  <g fill="none" stroke="#0a0f2c">
    <path d="M334 148 A236 236 0 1 0 540 269" stroke-width="40"/>
    <path d="M350 82 L422 146 L350 210" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g fill="none" stroke="#3452e1" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="18">
      <path d="M190 352 V524 Q190 536 202 536 H468 Q480 536 480 524 V352"/>
      <path d="M188 356 L228 322 M482 356 L442 322"/>
      <path d="M190 356 L335 448 L480 356"/>
      <path d="M196 528 L290 424 M474 528 L380 424"/>
      <path d="M228 382 V277 Q228 266 239 266 H292 L335 251 L378 266 H431 Q442 266 442 277 V382"/>
    </g>
    <g stroke-width="12">
      <circle cx="333" cy="350" r="21"/>
      <path d="M355 328 V362 C355 380 384 380 384 352 V345"/>
      <path d="M363 393 A52 52 0 1 1 384 345"/>
    </g>
  </g>`;

/** White square with the mark centred and scaled. The icons need a solid background because
 *  the navy ring would vanish on a dark launcher or splash screen. */
const svg = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#ffffff"/>
  <g transform="translate(300 300) scale(${scale}) translate(-334 -351)">${mark}</g>
</svg>`;

const targets = [
  { file: "public/icons/icon-192.png", size: 192, scale: 0.9 },
  { file: "public/icons/icon-512.png", size: 512, scale: 0.9 },
  // Maskable icons keep the artwork inside the central safe zone.
  { file: "public/icons/icon-maskable-512.png", size: 512, scale: 0.68 },
  { file: "public/icons/apple-touch-icon.png", size: 180, scale: 0.86 },
];

for (const { file, size, scale } of targets) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
