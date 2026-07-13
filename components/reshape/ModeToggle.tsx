export type ReshapeMode = "rows" | "lyrics" | "chords";

export const RESHAPE_MODES: { id: ReshapeMode; label: string }[] = [
  { id: "rows", label: "Rows" },
  { id: "lyrics", label: "Lyrics" },
  { id: "chords", label: "Chords" },
];

/** Segmented control switching the reshape page between its three modes. */
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: ReshapeMode;
  onChange: (mode: ReshapeMode) => void;
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {RESHAPE_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={mode === m.id}
          onClick={() => onChange(m.id)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            mode === m.id
              ? "bg-white font-semibold text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
