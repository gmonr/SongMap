---
name: verify
description: Build, run, and drive SongMap to verify a change end-to-end.
---

# Verifying SongMap changes

## Build & launch

- `npm ci && npm run dev` (Next.js 15, ready in ~2s on
  http://localhost:3000). `npm run typecheck` and `npm test` (vitest) exist
  but are CI's job, not verification.
- Without `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` the app
  runs in demo mode: middleware passes everything through, but auth'd pages
  (`/songs/[id]/edit`, `/songs/[id]/reshape`) redirect away, and saves need a
  real Supabase.

## Driving auth'd views without Supabase

Client view components (`ReshapeView`, `SongEditor`, …) take a plain
`SongRow` prop, so mount one on a throwaway route with a fixture song —
e.g. `app/verify-reshape/page.tsx` rendering
`<ReshapeView song={fixture} songHref="/" initialMode="chords" />` — drive
that, and delete the route before committing. Everything except Save works.

## Driving

Playwright + the pre-installed Chromium: `npm i playwright` in a scratch
dir, then `chromium.launch({ executablePath:
"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })` (the version suffix
varies — `ls /opt/pw-browsers`). Use a ~420px-wide viewport: reshape is the
mobile surface, and the docked SelectionBar layout only shows its cramping
there.

## Gotchas

- In dev, the Next.js dev-tools badge (dark "N" circle, bottom-left)
  overlaps the SelectionBar's leftmost button in screenshots — dev-only, not
  an app bug.
- Reshape ops signal no-op by returning the same reference; a stray tap that
  should do nothing must leave Save disabled (not dirty) — good cheap probe.
- Undo is in the sticky header; after undoing everything, Save must disable
  again.
