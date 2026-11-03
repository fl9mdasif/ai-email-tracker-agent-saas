/**
 * A single-series column chart drawn as plain SVG, with no chart library. Follows the house chart
 * rules: thin columns with a rounded top sitting on the baseline, a quiet grid, one color from the
 * theme (so light and dark both read), only the biggest value labelled, a tooltip on every column,
 * and a table version for screen readers and anyone who prefers numbers.
 */

export type BarDatum = { label: string; value: number };

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 18, right: 8, bottom: 22, left: 30 };

/** The top of the scale: a round number at or above the data, so the grid lines read cleanly. */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * step >= max) return factor * step;
  }
  return 10 * step;
}

export function BarChart({ data, title, unit }: { data: BarDatum[]; title: string; unit: string }) {
  const top = niceMax(Math.max(0, ...data.map((entry) => entry.value)));
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = data.length > 0 ? innerWidth / data.length : innerWidth;
  const barWidth = Math.max(2, Math.min(14, slot * 0.6));
  const y = (value: number) => PAD.top + innerHeight - (value / top) * innerHeight;
  const biggest = data.reduce((best, entry, index) => (entry.value > (data[best]?.value ?? -1) ? index : best), 0);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">· {total.toLocaleString("en-US")} {unit} in total</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title}. ${total} ${unit} in total.`} className="h-auto w-full max-w-3xl">
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={tick === 0 ? 2 : 1} />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}

        {data.map((entry, index) => {
          const x = PAD.left + slot * index + (slot - barWidth) / 2;
          const height = Math.max(entry.value > 0 ? 2 : 0, (entry.value / top) * innerHeight);
          const radius = Math.min(4, barWidth / 2, height);
          const bottom = PAD.top + innerHeight;
          return (
            <g key={entry.label}>
              {/* A wider invisible area is the hover target, so thin columns are easy to point at. */}
              <rect x={PAD.left + slot * index} y={PAD.top} width={slot} height={innerHeight} fill="transparent">
                <title>{`${entry.label}: ${entry.value.toLocaleString("en-US")} ${unit}`}</title>
              </rect>
              {height > 0 ? (
                <path
                  d={`M ${x} ${bottom} L ${x} ${bottom - height + radius} Q ${x} ${bottom - height} ${x + radius} ${bottom - height} L ${x + barWidth - radius} ${bottom - height} Q ${x + barWidth} ${bottom - height} ${x + barWidth} ${bottom - height + radius} L ${x + barWidth} ${bottom} Z`}
                  fill="var(--primary)"
                  pointerEvents="none"
                />
              ) : null}
              {index === biggest && entry.value > 0 ? (
                <text x={x + barWidth / 2} y={bottom - height - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
                  {entry.value}
                </text>
              ) : null}
            </g>
          );
        })}

        {data.length > 0 ? (
          <>
            <text x={PAD.left} y={HEIGHT - 6} fontSize={10} fill="var(--muted-foreground)">
              {data[0].label}
            </text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {data[data.length - 1].label}
            </text>
          </>
        ) : null}
      </svg>

      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground underline-offset-4 hover:underline">View as table</summary>
        <table className="mt-2 w-full max-w-xs text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium capitalize">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.label} className="border-t">
                <td className="py-1">{entry.label}</td>
                <td className="py-1 tabular-nums">{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
