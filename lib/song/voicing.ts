/**
 * Chord symbol -> playable MIDI voicing for the playback synth. Pure data —
 * no Web Audio here. Chord tones are close-voiced into the octave above
 * middle C (every tone lands in C4..B4) and the bass note (slash bass or
 * root) into C2..B2, which keeps consecutive chords in one register instead
 * of jumping with the root's letter name.
 */
import { Chord, Note } from "tonal";

export interface Voicing {
  /** MIDI note of the bass (slash bass or root), or null if unpitched. */
  bassMidi: number | null;
  /** MIDI notes of the chord tones, ascending, within C4..B4. */
  toneMidis: number[];
}

const C4 = 60;
const C2 = 36;

/**
 * Resolve a chord symbol to a voicing, or null when there is nothing to
 * play (empty, "N.C.", "%", or unparseable text).
 */
export function voiceChord(sym: string | null | undefined): Voicing | null {
  const trimmed = (sym ?? "").trim();
  if (!trimmed || /^(n\.?c\.?|%)$/i.test(trimmed)) return null;

  const [mainPart, bassPart] = trimmed.split("/");
  const chord = Chord.get(mainPart);
  if (chord.empty || chord.notes.length === 0) return null;

  const toneMidis: number[] = [];
  for (const note of chord.notes) {
    const chroma = Note.chroma(note);
    if (chroma === undefined || chroma === null) continue;
    const midi = C4 + chroma;
    if (!toneMidis.includes(midi)) toneMidis.push(midi);
  }
  if (toneMidis.length === 0) return null;
  toneMidis.sort((a, b) => a - b);

  const bassName = bassPart?.trim() || chord.tonic || "";
  const bassChroma = bassName ? Note.chroma(bassName) : null;
  const bassMidi =
    bassChroma === undefined || bassChroma === null ? null : C2 + bassChroma;

  return { bassMidi, toneMidis };
}

/** Equal-temperament frequency of a MIDI note (A4 = 440 Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
