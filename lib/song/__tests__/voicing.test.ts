import { describe, expect, it } from "vitest";
import { midiToFreq, voiceChord } from "../voicing";

describe("voiceChord", () => {
  it("close-voices a major triad above middle C with the root as bass", () => {
    const v = voiceChord("C");
    expect(v).not.toBeNull();
    expect(v!.toneMidis).toEqual([60, 64, 67]); // C4 E4 G4
    expect(v!.bassMidi).toBe(36); // C2
  });

  it("keeps every tone within the C4..B4 octave", () => {
    for (const sym of ["B", "Am7", "Ebmaj7", "F#m", "Gsus4"]) {
      const v = voiceChord(sym);
      expect(v, sym).not.toBeNull();
      for (const m of v!.toneMidis) {
        expect(m, sym).toBeGreaterThanOrEqual(60);
        expect(m, sym).toBeLessThan(72);
      }
    }
  });

  it("uses the slash bass instead of the root", () => {
    const v = voiceChord("F/C");
    expect(v!.bassMidi).toBe(36); // C2, not F2
    expect(v!.toneMidis).toEqual([60, 65, 69]); // C4 F4 A4
  });

  it("returns null for silence markers and unparseable text", () => {
    expect(voiceChord("")).toBeNull();
    expect(voiceChord("  ")).toBeNull();
    expect(voiceChord("N.C.")).toBeNull();
    expect(voiceChord("nc")).toBeNull();
    expect(voiceChord("%")).toBeNull();
    expect(voiceChord("???")).toBeNull();
    expect(voiceChord(null)).toBeNull();
    expect(voiceChord(undefined)).toBeNull();
  });

  it("voices minor sevenths with four distinct tones", () => {
    const v = voiceChord("Am7");
    expect(v!.toneMidis).toHaveLength(4);
    expect(v!.bassMidi).toBe(45); // A2
  });
});

describe("midiToFreq", () => {
  it("tunes A4 to 440 and octaves to powers of two", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
});
