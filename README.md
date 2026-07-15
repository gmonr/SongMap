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

## Features (Phase 2)

- **Paste-and-parse import** (`/songs/import`) — paste an Ultimate
  Guitar-style sheet (chords above lyrics, `[Verse 1]` headers) or ChordPro
  text (auto-detected; `{title:}`/`{artist:}`/`{key:}` prefill metadata).
  Powered by [chordsheetjs](https://github.com/martijnversluis/ChordSheetJS).
- **Bar heuristics** — each chord change becomes one bar and the lyric chunk
  under it becomes that bar's phrase (a word split by a mid-word chord change
  stays with the bar where it starts). No text format encodes bar counts, so
  they're a first guess to correct in the editor — except pipe lines
  (`| Am . . . | F |`, common in intro/solo blocks), which are parsed
  exactly, beat dots included.
- **Structure detection** — a bare repeated header (`[Chorus]` with nothing
  under it) becomes a re-reference to the earlier section instead of a new
  one; sections are auto-colored by role (verse/chorus/bridge/…); the key is
  guessed from the chords when the paste doesn't declare one. Guitar-tab
  lines are skipped with a warning.
- **Live preview** — the pasted text renders as a song map as you type,
  before anything is saved.

## Features (Phase 3)

- **Practice mode** (`/songs/[id]/practice`) — two memorization drills,
  switchable from the same screen, both built on the regular song-map
  rendering so transpose/notation/lyrics controls behave the same as the
  main view.
  - **Progressive hiding** — pick what fraction of bars (0/25/50/75/100%)
    render as blank click-to-reveal cards instead of their chord and lyric;
    "Shuffle" redraws which bars are hidden at the current level so repeat
    passes don't just memorize a fixed pattern.
  - **Shuffled sections** — steps through the arrangement's sections one at
    a time in a randomized order, to practice recall without leaning on the
    song's usual sequence. "Reshuffle" draws a new order.
- **Chord-diagram popovers** — click any chord symbol in the practice view
  to see its notes on a piano keyboard, root highlighted; closes on outside
  click or Escape. (On the song map itself, chord taps start playback —
  see Phase 5.)

## Features (Phase 4)

- **Reshape page** (`/songs/[id]/reshape`) — the import's bar layout is a
  first guess (see Phase 2), and fixing it in the editor meant cut-and-paste
  across many small inputs. Reshape restructures a song with plain taps on
  compact bar chips, so it works the same on mobile and desktop. Three modes
  behind one toggle (deep-linkable via `?mode=lyrics` / `?mode=chords`):
  - **Rows** — tap the seam between two bars to break the row there; tap the
    merge seam between two rows to join them. Lyrics stay with their bar.
  - **Lyrics** — each bar shows its chord label over its words as pills; tap
    the gap between two words to move the nearest bar break there. Tap a
    bar's chord label to pick up its whole phrase, then ◀ ▶ to shift it a bar
    at a time (occupied neighbors ripple into the row's first empty bar).
  - **Chords** — tap a chord (say, the stray one in a split bar), then ◀ ▶ to
    walk it into the neighboring bar, across row boundaries too. An empty bar
    absorbs it; an occupied bar becomes a split bar, re-split evenly using
    the same rule as the importer, while the source bar folds the departed
    beats into the neighboring chord so hand-tuned splits survive. The
    selection bar also inserts a copy of the chord before/after it, deletes
    it (beats fold into the left neighbor), and shows the bar's beats as a
    **dot strip**: tap a gap between dots to move the beat split there, the
    same gesture as word gaps in Lyrics mode. Empty `—` bars are tappable to
    give them a chord, seeded from the nearest chord (which is what `—`
    already meant).

  Picking something up docks a **selection bar** at the bottom of the screen
  (thumb-sized ◀ ▶, nothing reflows around the selected chip), the header
  stays sticky with **Undo** and Save always reachable, leaving the page with
  unsaved changes asks first, and the whole surface suppresses long-press
  text selection and double-tap zoom so repeated taps stay fluid on phones.
- **Tests** — `npm test` runs the [vitest](https://vitest.dev) unit tests in
  `lib/song/__tests__/` covering the data ops behind reshape: row
  split/merge, word-boundary moves, phrase shifts, and chord
  move/insert/delete with beat redistribution and beat-boundary moves.

## Features (Phase 5)

- **Playback** — a ▶ Play button on the song map plays the arrangement in
  time: a metronome click per beat (accented downbeats) and a soft piano-ish
  synth strike per chord (close-voiced above middle C over a bass note, via
  Web Audio — no samples, no dependencies). The sounding bar is highlighted
  and kept in view, repeats (`×2`) are unrolled, `—` placeholder bars sound
  their carried chord, and the playhead entering a collapsed
  `same as Verse 1` card auto-expands it.
- **Transport bar** — docked at the bottom (same pattern as reshape's
  selection bar): play/pause, stop, previous/next section, and a live
  section + bar readout. Every section card also gets a ▶ to start playback
  from that section.
- **Tap a chord to play from it** — on the song map, tapping any chord
  symbol starts playback right there (opening the transport if needed);
  tapping the second chord of a split bar enters the bar at that chord's
  beat. This replaces the song map's piano-diagram popovers, which now
  live in the practice view only.
- **Practice knobs** — live tempo control (± around the song's ♩, with
  reset), loop **off / section / song** (section loops include all repeat
  passes), a one-bar count-in toggle, and independent click / chords mutes —
  all applied mid-flight without restarting. Audio follows the current
  transpose: shift the display key and the chords sound in that key.

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

### Ultimate Guitar search (`UG_PROXY_TEMPLATE`, optional)

The import page can search Ultimate Guitar and pull a chord sheet directly.
UG blocks many hosting providers' IP ranges with a 403; when a direct fetch
fails, the app automatically retries through a few free public fetch relays.
If those prove flaky, set `UG_PROXY_TEMPLATE` to route UG requests through a
scraping API instead — `{url}` is replaced with the URI-encoded target page,
`{rawUrl}` with the target verbatim:

```
# ScraperAPI (free tier ~1,000 requests/month)
UG_PROXY_TEMPLATE=http://api.scraperapi.com/?api_key=YOUR_KEY&url={url}

# scrape.do (free tier ~1,000 requests/month)
UG_PROXY_TEMPLATE=https://api.scrape.do/?token=YOUR_TOKEN&url={url}
```

Privacy note: anything fetched through a relay or scraping API (the search
terms and tab pages) passes through that third-party service.

## Notes

- Minor keys are accepted (e.g. `Am`); numerals are computed relative to the
  minor tonic. Borrowed chords and secondary dominants get best-effort
  numbering — the letters view is always exact.
- Keep entered/imported song content private; lyrics are copyrighted.
