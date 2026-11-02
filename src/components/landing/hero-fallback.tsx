const LANES = [
  { label: "Reply", color: "#7c6cff", y: 70 },
  { label: "Follow-up", color: "#f5a524", y: 130 },
  { label: "Hot lead", color: "#ef4444", y: 190 },
  { label: "FYI", color: "#38bdf8", y: 250 },
];

/**
 * Lightweight stand-in for the 3D scene: the same flow as an SVG with a gentle
 * CSS animation. Used for reduced motion, low-power devices and no WebGL.
 */
export function HeroFallback() {
  return (
    <svg
      viewBox="0 0 400 320"
      role="img"
      aria-label="Emails flow into an AI core and are sorted into Reply, Follow-up, Hot lead and FYI"
      className="size-full"
    >
      <style>{`
        @keyframes core-pulse { 0%, 100% { opacity: .85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes drift { from { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } to { transform: translateX(110px); opacity: 0; } }
        .core { transform-origin: 160px 160px; animation: core-pulse 2.6s ease-in-out infinite; }
        .mail { animation: drift 4.5s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .core, .mail { animation: none; opacity: 1; } }
      `}</style>

      {[100, 160, 220].map((y, i) => (
        <g key={y} className="mail" style={{ animationDelay: `${i * 1.5}s` }}>
          <rect x="14" y={y - 14} width="38" height="26" rx="5" className="fill-muted-foreground/60" />
          <path d={`M17 ${y - 11} 33 ${y} 49 ${y - 11}`} fill="none" stroke="#1a1a2e" strokeOpacity=".35" />
        </g>
      ))}

      <g className="core">
        <circle cx="160" cy="160" r="46" fill="#6d5efc" opacity=".25" />
        <circle cx="160" cy="160" r="30" fill="#6d5efc" />
        <circle cx="160" cy="160" r="58" fill="none" stroke="#9a8cff" strokeWidth="1.5" strokeDasharray="4 6" />
      </g>

      {LANES.map((lane) => (
        <g key={lane.label}>
          <path
            d={`M206 160 C 250 160, 250 ${lane.y}, 292 ${lane.y}`}
            fill="none"
            stroke={lane.color}
            strokeOpacity=".55"
            strokeWidth="2"
          />
          <rect x="292" y={lane.y - 14} width="98" height="28" rx="14" fill={lane.color} fillOpacity=".15" stroke={lane.color} />
          <text x="341" y={lane.y + 4} textAnchor="middle" fontSize="12" fontWeight="500" className="fill-foreground">
            {lane.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
