import type { SongRow } from "./types";

export const DEMO_SONG_ID = "demo";

/**
 * A hand-entered demo song so the SongMap view works before Supabase is
 * configured. Chords/structure of "Let It Be" (The Beatles) — chord names
 * and section structure are facts and not copyrightable; lyric text here is
 * limited to short placeholder cues.
 */
export const DEMO_SONG: SongRow = {
  id: DEMO_SONG_ID,
  title: "Let It Be",
  artist: "The Beatles",
  key: "C",
  time_signature: "4/4",
  tempo: 72,
  capo: 0,
  source_url: null,
  data: {
    sections: {
      verse: {
        label: "Verse",
        color: "blue",
        lines: [
          {
            bars: [
              { chords: [{ sym: "C", beats: 4 }] },
              { chords: [{ sym: "G", beats: 4 }] },
              { chords: [{ sym: "Am", beats: 4 }] },
              { chords: [{ sym: "F", beats: 4 }] },
            ],
            lyrics: [
              { text: "When I find my-", bar: 0 },
              { text: "self in times of", bar: 1 },
              { text: "trouble, Mother", bar: 2 },
              { text: "Mary comes to me", bar: 3 },
            ],
          },
          {
            bars: [
              { chords: [{ sym: "C", beats: 4 }] },
              { chords: [{ sym: "G", beats: 4 }] },
              {
                chords: [
                  { sym: "F", beats: 2 },
                  { sym: "C", beats: 2 },
                ],
              },
              { chords: [{ sym: "C", beats: 4 }] },
            ],
            lyrics: [
              { text: "speaking words of", bar: 0 },
              { text: "wisdom,", bar: 1 },
              { text: "let it be", bar: 2 },
            ],
          },
        ],
      },
      chorus: {
        label: "Chorus",
        color: "amber",
        lines: [
          {
            bars: [
              { chords: [{ sym: "Am", beats: 4 }] },
              { chords: [{ sym: "G", beats: 4 }] },
              { chords: [{ sym: "F", beats: 4 }] },
              { chords: [{ sym: "C", beats: 4 }] },
            ],
            lyrics: [
              { text: "Let it be,", bar: 0 },
              { text: "let it be,", bar: 1 },
              { text: "let it be,", bar: 2 },
              { text: "let it be", bar: 3 },
            ],
          },
          {
            bars: [
              { chords: [{ sym: "C", beats: 4 }] },
              { chords: [{ sym: "G", beats: 4 }] },
              {
                chords: [
                  { sym: "F", beats: 2 },
                  { sym: "C", beats: 2 },
                ],
              },
              { chords: [{ sym: "C", beats: 4 }] },
            ],
            lyrics: [
              { text: "whisper words of", bar: 0 },
              { text: "wisdom,", bar: 1 },
              { text: "let it be", bar: 2 },
            ],
          },
        ],
      },
    },
    arrangement: [
      { ref: "verse", instanceLabel: "Verse 1" },
      { ref: "verse", instanceLabel: "Verse 2", sameChordsAs: "verse" },
      { ref: "chorus", instanceLabel: "Chorus" },
      { ref: "verse", instanceLabel: "Verse 3", sameChordsAs: "verse" },
      { ref: "chorus", instanceLabel: "Chorus", repeat: 2 },
    ],
  },
};
