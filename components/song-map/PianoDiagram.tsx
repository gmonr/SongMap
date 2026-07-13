const WHITE_W = 26;
const WHITE_H = 92;
const BLACK_W = 16;
const BLACK_H = 56;

/** White keys left-to-right, as pitch classes (C=0). */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

/** Black keys, each anchored to the index (0-6) of the white key it follows. */
const BLACK_KEYS = [
  { chroma: 1, afterWhite: 0 },
  { chroma: 3, afterWhite: 1 },
  { chroma: 6, afterWhite: 3 },
  { chroma: 8, afterWhite: 4 },
  { chroma: 10, afterWhite: 5 },
];

/**
 * A single generic piano octave (C to B) with chord tones highlighted and
 * the root marked with a dot. Used in the chord popover.
 */
export function PianoDiagram({
  toneChromas,
  rootChroma,
}: {
  toneChromas: Set<number>;
  rootChroma: number | null;
}) {
  const width = WHITE_KEYS.length * WHITE_W;

  return (
    <svg
      viewBox={`0 0 ${width} ${WHITE_H}`}
      width={width}
      height={WHITE_H}
      role="img"
      aria-label="Piano keyboard diagram"
    >
      {WHITE_KEYS.map((chroma, i) => {
        const active = toneChromas.has(chroma);
        const isRoot = chroma === rootChroma;
        return (
          <g key={chroma}>
            <rect
              x={i * WHITE_W}
              y={0}
              width={WHITE_W}
              height={WHITE_H}
              rx={3}
              fill={isRoot ? "#2563eb" : active ? "#bfdbfe" : "#ffffff"}
              stroke={isRoot ? "#1d4ed8" : active ? "#60a5fa" : "#cbd5e1"}
              strokeWidth={1}
            />
            {active && (
              <circle
                cx={i * WHITE_W + WHITE_W / 2}
                cy={WHITE_H - 16}
                r={4}
                fill={isRoot ? "#ffffff" : "#2563eb"}
              />
            )}
          </g>
        );
      })}
      {BLACK_KEYS.map(({ chroma, afterWhite }) => {
        const active = toneChromas.has(chroma);
        const isRoot = chroma === rootChroma;
        const x = (afterWhite + 1) * WHITE_W - BLACK_W / 2;
        return (
          <g key={chroma}>
            <rect
              x={x}
              y={0}
              width={BLACK_W}
              height={BLACK_H}
              rx={2}
              fill={isRoot ? "#1d4ed8" : active ? "#3b82f6" : "#1e293b"}
            />
            {active && (
              <circle
                cx={x + BLACK_W / 2}
                cy={BLACK_H - 12}
                r={3}
                fill="#ffffff"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
