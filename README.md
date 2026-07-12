# SongMap

A personal piano-practice web app for memorizing **chord structure + lyrics**.
Instead of chords floating over lyric characters (Ultimate Guitar) or beat
squares with no sections (Chordify), SongMap renders a song as a **map**:
color-coded section cards, each with an equal-width bar grid (one cell per
bar, beat dots inside) and lyric phrases aligned under their bar.

Built with Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Supabase, and
[tonal](https://github.com/tonaljs/tonal) for transposition and Roman-numeral /
Nashville-number display.

## Features (Phase 1)

- **Song map view** — arrangement rendered as section cards; bars wrap at
  4 (mobile) / 8 (desktop); split bars show per-chord beat dots.
- **Notation toggle** — chord letters / Roman numerals (`vi–V–IV–I`) /
  Nashville numbers (`6- 5 4 1`), derived live from the song key via tonal,
  never stored.
- **Transpose** — key selector plus ± semitone buttons; slash chords handled;
  spelling follows the target key (flats in flat keys).
- **Structure encoding** — repeats (`×2`) and `same as Verse 1` references are
  part of the data model; repeated sections render collapsed.
- **Structure-only mode** — hide lyrics to drill the chord map alone.
- **Manual editor** — sections (label + color), lines, bars, chords with beat
  counts, split bars, per-bar lyric phrases, and arrangement ordering.

## Data model

The atomic unit is the **bar** (the thing ChordPro/Ultimate Guitar formats
don't encode). See `lib/song/types.ts`:

```
SongData
├─ sections: Record<id, { label, color, lines: Line[] }>
│    Line = { bars: { chords: { sym, beats }[] }[],
│             lyrics: { text, bar }[] }
└─ arrangement: { ref, instanceLabel, repeat?, sameChordsAs? }[]
```

Flat metadata (title, artist, key, tempo…) lives in real columns on the
`songs` table; the blob above lives in a `jsonb` column. Roman/Nashville
numbers are always computed from `key` + chord symbol at render time.

## Setup

1. `npm install`
2. Create a [Supabase](https://supabase.com) project and run the SQL in
   `supabase/migrations/0001_create_songs.sql` (SQL editor or
   `supabase db push`). Row-Level Security scopes every row to its owner.
3. Copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. `npm run dev` and sign in with a magic link.

Without `.env.local` the app runs in **demo mode**: the bundled demo song
(`/songs/demo`) shows the full song-map view, but nothing can be created or
saved.

## Roadmap

- **Phase 2 — paste-and-parse import**: `chordsheetjs`'s
  `UltimateGuitarParser` to prefill chords/lyrics/sections from pasted text;
  bar counts stay manual (no source format encodes them).
- **Phase 3 — memorization**: progressive hiding, interleaved practice mode
  (shuffled sections), chord-diagram popovers.

## Notes

- Minor keys are accepted (e.g. `Am`); numerals are computed relative to the
  minor tonic. Borrowed chords and secondary dominants get best-effort
  numbering — the letters view is always exact.
- Keep entered/imported song content private; lyrics are copyrighted.
