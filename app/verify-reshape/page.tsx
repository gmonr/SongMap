"use client";

import { ReshapeView } from "@/components/reshape/ReshapeView";
import type { SongRow } from "@/lib/song/types";

const fixture: SongRow = {
  id: "verify",
  title: "A Fairly Long Song Title To Truncate",
  artist: null,
  key: "C",
  time_signature: "4/4",
  tempo: null,
  capo: null,
  source_url: null,
  data: {
    sections: {
      "verse-1": {
        label: "Verse",
        color: "blue",
        lines: [
          {
            bars: [
              { chords: [{ sym: "C", beats: 4 }] },
              { chords: [{ sym: "F", beats: 4 }] },
              { chords: [{ sym: "G", beats: 4 }] },
            ],
            lyrics: [
              {
                text: "a very long imported phrase that used to clip under the section card with no horizontal scroll at all THE-END",
                bar: 0,
              },
              { text: "my old", bar: 1 },
            ],
          },
        ],
      },
    },
    arrangement: [{ ref: "verse-1", instanceLabel: "Verse 1" }],
  },
};

export default function VerifyReshapePage() {
  return <ReshapeView song={fixture} songHref="/" initialMode="lyrics" />;
}
