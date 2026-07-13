/**
 * Chord symbol -> piano keyboard shape, for the chord-diagram popover.
 * Pitch classes (0-11, C=0) rather than octave-specific notes: the popover
 * draws a single generic octave, so only "which of the 12 keys light up"
 * matters.
 */
import { Chord, Note } from "tonal";

export interface PianoChord {
  /** true when `sym` resolved to a real chord. */
  valid: boolean;
  /** Root pitch class (0-11), or null for an unpitched/empty symbol. */
  rootChroma: number | null;
  /** Pitch classes of every chord tone, including the root. */
  toneChromas: Set<number>;
  /** Note names as returned by tonal, bass-first for slash chords. */
  notes: string[];
}

const NO_CHORD: PianoChord = {
  valid: false,
  rootChroma: null,
  toneChromas: new Set(),
  notes: [],
};

/** Resolve a chord symbol (letters notation, e.g. "Am7", "F/C") to piano keys. */
export function pianoChordFor(sym: string | null | undefined): PianoChord {
  const trimmed = (sym ?? "").trim();
  if (!trimmed || /^(n\.?c\.?|%)$/i.test(trimmed)) return NO_CHORD;

  const chord = Chord.get(trimmed);
  if (chord.empty || chord.notes.length === 0) return NO_CHORD;

  const toneChromas = new Set<number>();
  for (const note of chord.notes) {
    const chroma = Note.chroma(note);
    if (chroma !== undefined && chroma !== null) toneChromas.add(chroma);
  }
  if (toneChromas.size === 0) return NO_CHORD;

  const rootChroma = chord.tonic ? Note.chroma(chord.tonic) : null;

  return {
    valid: true,
    rootChroma: rootChroma ?? null,
    toneChromas,
    notes: chord.notes,
  };
}
