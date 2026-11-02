import * as THREE from "three";
import type { Provider, SampleMail } from "./providers";

const WIDTH = 640;
const HEIGHT = 400;

export type CardTextures = { raw: THREE.CanvasTexture; sorted: THREE.CanvasTexture };

const cache = new Map<string, CardTextures>();

function draw(provider: Provider, mail: SampleMail, sorted: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");

  const font = (size: number, weight = 600) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

  // card body
  ctx.fillStyle = "rgba(18, 24, 54, 0.94)";
  ctx.strokeStyle = sorted ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, WIDTH - 8, HEIGHT - 8, 30);
  ctx.fill();
  ctx.stroke();

  // provider tag
  ctx.fillStyle = provider.color;
  ctx.beginPath();
  ctx.arc(52, 62, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(34, 700);
  ctx.textBaseline = "middle";
  ctx.fillText(provider.name, 78, 62);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = font(24, 500);
  ctx.textAlign = "right";
  ctx.fillText("now", WIDTH - 44, 62);
  ctx.textAlign = "left";

  // divider
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(40, 102, WIDTH - 80, 2);

  // sender row
  ctx.fillStyle = provider.color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(70, 168, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = font(26, 700);
  ctx.textAlign = "center";
  ctx.fillText(mail.from.charAt(0), 70, 170);
  ctx.textAlign = "left";
  ctx.font = font(30, 700);
  ctx.fillText(mail.from, 118, 150);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = font(26, 500);
  ctx.fillText(mail.subject, 118, 192);

  // skeleton text lines
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(40, 240, WIDTH - 120, 16, 8);
  ctx.roundRect(40, 274, WIDTH - 200, 16, 8);
  ctx.fill();

  // priority chip only after the AI scan
  if (sorted) {
    ctx.font = font(24, 700);
    const textWidth = ctx.measureText(mail.chip).width;
    const chipWidth = textWidth + 44;
    const x = WIDTH - 40 - chipWidth;
    const y = HEIGHT - 84;
    ctx.fillStyle = mail.chipColor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.roundRect(x, y, chipWidth, 48, 24);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mail.chipColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(mail.chip, x + 22, y + 25);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Raw and sorted faces for one provider and sample mail; built once and cached. */
export function getCardTextures(provider: Provider, mail: SampleMail): CardTextures {
  const key = `${provider.name}|${mail.subject}`;
  let textures = cache.get(key);
  if (!textures) {
    textures = { raw: draw(provider, mail, false), sorted: draw(provider, mail, true) };
    cache.set(key, textures);
  }
  return textures;
}

/** Frees GPU memory when the hero scene unmounts. */
export function disposeCardTextures(): void {
  for (const { raw, sorted } of cache.values()) {
    raw.dispose();
    sorted.dispose();
  }
  cache.clear();
}
