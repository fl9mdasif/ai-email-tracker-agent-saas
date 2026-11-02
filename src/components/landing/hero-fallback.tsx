import { PROVIDERS } from "./providers";

// Static positions (px from centre) and depth for five cards; CSS animates them toward the viewer.
const CARDS = [
  { provider: PROVIDERS[0], x: -150, y: -110, z: -700, delay: "0s" },
  { provider: PROVIDERS[2], x: 130, y: -40, z: -520, delay: "-2s" },
  { provider: PROVIDERS[3], x: -110, y: 70, z: -340, delay: "-4s" },
  { provider: PROVIDERS[1], x: 90, y: 120, z: -160, delay: "-6s" },
  { provider: PROVIDERS[4], x: 0, y: -20, z: 0, delay: "-8s" },
];

/**
 * Lightweight stand-in for the 3D tunnel: the same idea in pure CSS 3D. Used for reduced
 * motion, low-power devices and no WebGL. Under reduced motion it stays as a still stack.
 */
export function HeroFallback() {
  return (
    <div
      role="img"
      aria-label="Emails from Gmail, Outlook, Zoho, Hostinger and Instantly flying toward you"
      className="relative size-full overflow-hidden [perspective:900px]"
    >
      <div className="absolute inset-0 [transform-style:preserve-3d]">
        {CARDS.map(({ provider, x, y, z, delay }) => (
          <div
            key={provider.name}
            className="tunnel-card absolute top-1/2 left-1/2 -mt-16 -ml-28 w-56 rounded-2xl border border-white/15 bg-[#121836]/90 p-4"
            style={
              {
                "--x": `${x}px`,
                "--y": `${y}px`,
                "--z": `${z}px`,
                "--d": delay,
              } as React.CSSProperties
            }
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: provider.color }} />
              {provider.name}
            </p>
            <div className="mt-4 h-2 w-4/5 rounded-full bg-white/15" />
            <div className="mt-2 h-2 w-3/5 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
