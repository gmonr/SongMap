# Reshape roadmap (from the 2026-07 UX audit)

Reshape's product direction, decided during the reshape UX audit: reshape
becomes the **mobile editor** — structure by tap, small text edits behind an
explicit action — while `SongEditor` stays the desktop power tool. The
conceptual model keeps each mode owning one grain: **Rows = bars, Chords =
chords, Lyrics = words**, each with move/insert/delete/edit on the docked
selection bar. Chords are deliberately *not* immutable long-term, but taps
never type: the keyboard only opens from an explicit ✎ tap.

**P0 (done)** — touch hardening: `.reshape-surface` CSS (no long-press text
selection, no double-tap zoom), docked `SelectionBar` (zero layout shift,
44px targets), wide invisible hit boxes on gap/seam buttons, undo stack,
unsaved-changes guard, sticky header, growable split-bar chips.

## P1 (done) — Chord completeness (Chords mode)

Solves: can't insert a chord (including at the start of a line), can't delete
a chord, can't control beat distribution (3 chords in 4/4 are forced to
1+1+2), and moves destroy hand-tuned beat splits.

- `lib/song/chords.ts`, new pure ops (same-reference-on-no-op like existing):
  - `insertChord(lines, li, bi, pos, sym)` — insert at start/end/between;
    replaces a lone `""` placeholder; respects the `totalBeats` chord cap;
    even re-split.
  - `deleteChord(lines, li, bi, ci)` — remove; beats go to the left neighbor
    (mirror of the editor's `removeChord`); emptied bar → `""` placeholder.
  - `setBeatBoundary(bar, ci, beats)` — move the beat boundary between chord
    `ci` and `ci + 1` (each side ≥ 1 beat).
  - Soften `moveChord`: the source bar hands the moved chord's beats to its
    neighbor instead of a full even re-split, so custom splits survive.
- `SelectionBar` gains 🗑 delete, "+ chord before/after", and the **beat-dot
  strip**: the selected bar's beats as dots grouped per chord, with tappable
  gaps between dots calling `setBeatBoundary` — the same "tap a boundary to
  move it" gesture as word gaps. No numbers, no dialogs.
- Empty bars (`—`) become tappable to select-and-add.
- Tests in `lib/song/__tests__/chords.test.ts` (existing pattern).

Shipped notes: taps never type, so inserted chords seed their symbol from
context — "+ before/after" copies the selected chord, and adding to an empty
bar uses the nearest chord in reading order (which is what `—` already
meant); renaming is P2's ✎. Moves preserve the *source* bar's splits (the
moved chord's beats fold into its neighbor, mirroring delete); an occupied
*destination* bar still re-splits evenly.

## P2 (done) — Small text edits

Solves: fixing a chord typo or misheard word requires the desktop editor.

- ✎ on a selected chord → one inline input in the `SelectionBar` editing
  `sym`; keyboard opens only from the explicit ✎ tap.
- ✎ on a selected phrase in Lyrics mode → same pattern for the text.
- No new modes, no always-on inputs.

Shipped notes: the ✎ swaps the whole `SelectionBar` for one input (✓ commit,
Esc/✕ cancel), backed by pure ops `renameChord` (keeps the beat split; no-ops
on ""/placeholder — deleting stays 🗑's job, and empty bars get chords via
＋) and `setBarLyric` (whitespace-normalized; committing "" clears the phrase
and drops the selection, since an empty phrase can't be re-picked). The bar
is keyed by selection identity so reselecting mid-edit drops the draft, and
`.reshape-surface input` re-enables text selection under the surface's
select-none.

## P3 (done) — Bar add/remove (Rows mode)

Solves: can't add or remove empty "same as before" (`—`) bars when the
import guessed the bar count wrong (neither can the editor, mid-line).

- `lib/song/lines.ts`: `insertBar(lines, li, bi)` (new `""`-placeholder bar,
  lyric indices re-mapped via existing `toDense`/`fromDense`) and
  `deleteBar(lines, li, bi)` (its lyric merges into the previous bar's).
- Rows mode: tap a bar chip to select the *bar* → `SelectionBar` shows
  [+ bar before] [+ bar after] [🗑 bar]. Seam/merge taps unchanged.
- Tests in `lib/song/__tests__/lines.test.ts`.

Shipped notes: the whole `BarChip` becomes the tap target in Rows mode
(chords and bar chips never nest buttons, since Chords mode owns per-sym
taps), and bar selections hide the SelectionBar's ◀ ▶ — bars don't move,
they're added/removed. Inserting keeps the selection on the new `—` bar
(mirroring chord inserts); `insertBar` takes `totalBeats` like the chord
ops so the placeholder spans the song's meter. Deleting the row's *first*
bar pushes its lyric onto the next bar (nothing precedes it), and deleting
a row's only bar removes the whole row.

## Known polish debt (done)

- ~~The sticky reshape header wraps to ~3 rows on phones (~15% of the
  viewport); compact it (e.g. icon-only Undo, tighter title row).~~ Done:
  two tight rows (title + back link, then mode toggle / icon-only ↶ / Save),
  errors on a rare third row.
- ~~`SelectionBar` subtitle truncates on narrow screens; shorten the copy.~~
  Done: subtitles now name the actions ("◀ ▶ move it one bar", "＋ add
  empty bar · 🗑 delete").
- A long phrase in one bar overflowed the section card's `overflow-hidden`
  with no scroll (Lyrics mode). Done: the bar's word row wraps instead.

## Known issues — Lyrics word gaps (fix TBD)

Tapping a word gap moves the *nearer* of the tapped bar's two edges there
(tie → left), decided invisibly in `boundaryFor`. Two consequences, found
in use 2026-07:

- Ambiguous: a mid-bar gap tap can move either boundary; the user can't
  predict whether words fold left or right.
- Corner: from an interior bar you can't push words rightward into an
  empty trailing bar — the boundary into it already sits after the bar's
  last word (so that edge is filtered as a no-op) and ties resolve left,
  so every tap folds words backwards. Workaround: select the phrase and ▶.
