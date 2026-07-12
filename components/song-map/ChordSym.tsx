import { chordDisplay, type Notation } from "@/lib/song/theory";
import { transposeChord } from "@/lib/song/theory";

export function ChordSym({
  sym,
  songKey,
  displayKey,
  notation,
  className = "",
}: {
  sym: string;
  songKey: string;
  displayKey: string;
  notation: Notation;
  className?: string;
}) {
  const transposed = transposeChord(sym, songKey, displayKey);
  const d = chordDisplay(transposed, displayKey, notation);
  if (!d.main) {
    return <span className={`text-slate-300 ${className}`}>—</span>;
  }
  return (
    <span className={className}>
      {d.main}
      {d.sup && <sup className="text-[0.6em] font-semibold">{d.sup}</sup>}
      {d.bass && <span className="text-[0.75em] opacity-70">{d.bass}</span>}
    </span>
  );
}
