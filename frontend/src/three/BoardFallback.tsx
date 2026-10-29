import { BOARD_D, BOARD_W, type BoardLayout, type BoardLeg, type BoardStop } from "./boardLayout";

const COLOR = { origin: "#f2f0e8", hub: "#7dd3fc", hotel: "#93c5fd", destination: "#55f1d1", venue: "#55f1d1" } as const;

/** Top-down SVG of the same board: shown while three.js loads, without WebGL, and if the scene fails. */
export function BoardFallback({ stops, legs, layout }: { stops: BoardStop[]; legs: BoardLeg[]; layout: BoardLayout }) {
  const S = 100; // svg units per board unit
  const w = BOARD_W * S;
  const h = BOARD_D * S;
  const cell = layout.cellSize * S;
  const p = layout.positions.map((q) => [q.x * S, q.z * S] as const);
  return (
    <svg viewBox={`${-w / 2 - 30} ${-h / 2 - 30} ${w + 60} ${h + 60}`} className="size-full" aria-hidden>
      <defs>
        <pattern id="bf-grid" width={cell} height={cell} patternUnits="userSpaceOnUse" x={-cell / 2} y={-cell / 2}>
          <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="#2b5a8a" strokeOpacity="0.5" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={-w / 2 - 30} y={-h / 2 - 30} width={w + 60} height={h + 60} fill="url(#bf-grid)" />
      {legs.map((l, i) => {
        const [x1, y1] = p[l.from];
        const [x2, y2] = p[l.to];
        const d = l.kind === "air"
          ? `M${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.25} ${x2} ${y2}`
          : `M${x1} ${y1} L ${x2} ${y2}`;
        return <path key={i} d={d} fill="none" stroke={l.kind === "air" ? "#55f1d1" : "#cbd5e1"} strokeWidth="2.5"
          strokeDasharray="7 7" strokeLinecap="round" />;
      })}
      {stops.map((s, i) => (
        <g key={s.id} transform={`translate(${p[i][0]} ${p[i][1]})`}>
          <circle r={s.kind === "venue" || s.kind === "origin" ? 8 : 6} fill={COLOR[s.kind]} />
          {/* staggered like the 3D stems, so labels of nearby places stack instead of overlapping */}
          <line y2={-14 - (i % 3) * 22} stroke={COLOR[s.kind]} strokeOpacity="0.5" />
          <text y={-18 - (i % 3) * 22} textAnchor="middle" fill="#e2e8f0" fontSize="15" fontWeight="600"
            stroke="#050b18" strokeWidth="4" paintOrder="stroke">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}
