import { PROVIDERS } from "./providers";

// Static positions (px from centre) and depth for five cards; CSS animates them toward the viewer.
// `intro` is the fly-in delay and `float` the bob period, both in seconds.
const CARDS = [
  { provider: PROVIDERS[0], x: -150, y: -110, z: -700, delay: "0s", intro: 0, float: 3, hot: true },
  { provider: PROVIDERS[2], x: 130, y: -40, z: -520, delay: "-2s", intro: 0.3, float: 3.5, hot: false },
  { provider: PROVIDERS[3], x: -110, y: 70, z: -340, delay: "-4s", intro: 0.6, float: 4, hot: false },
  { provider: PROVIDERS[1], x: 90, y: 120, z: -160, delay: "-6s", intro: 0.9, float: 4.2, hot: false },
  { provider: PROVIDERS[4], x: 0, y: -20, z: 0, delay: "-8s", intro: 1.2, float: 3.8, hot: false },
];

const FLY_IN_SECONDS = 0.8;

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
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="orbit-ring absolute top-1/2 left-1/2 -mt-[190px] -ml-[190px] size-[380px]"
      >
        <circle cx="200" cy="200" r="180" fill="none" stroke="#a78bfa" strokeOpacity="0.18" strokeWidth="2" />
        <circle
          cx="200"
          cy="200"
          r="180"
          fill="none"
          stroke="#c4b5fd"
          strokeOpacity="0.85"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="100 365"
        />
        <circle cx="380" cy="200" r="6" fill="#f5f3ff" />
      </svg>

      <div className="absolute inset-0 [transform-style:preserve-3d]">
        {CARDS.map(({ provider, x, y, z, delay, intro, float, hot }) => (
          <div
            key={provider.name}
            className="tunnel-card absolute top-1/2 left-1/2 -mt-16 -ml-28 w-56 [transform-style:preserve-3d]"
            style={
              {
                "--x": `${x}px`,
                "--y": `${y}px`,
                "--z": `${z}px`,
                "--d": delay,
              } as React.CSSProperties
            }
          >
            <div className="card-fly" style={{ animationDelay: `${intro}s` }}>
              <div
                className="card-float rounded-2xl border border-white/15 bg-[#121836]/90 p-4"
                style={{
                  animationDuration: `${float}s`,
                  animationDelay: `${intro + FLY_IN_SECONDS}s`,
                }}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: provider.color }} />
                  {provider.name}
                </p>
                <div className="mt-4 h-2 w-4/5 rounded-full bg-white/15" />
                <div className="mt-2 h-2 w-3/5 rounded-full bg-white/10" />
                {hot ? (
                  <span className="hot-glow mt-3 inline-block rounded-full border border-red-500/70 bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                    HOT LEAD
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
