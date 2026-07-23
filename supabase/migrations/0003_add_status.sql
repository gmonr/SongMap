-- Completion tracking for the Library: every song carries a status so
-- "have I actually checked this against the recording?" doesn't live only
-- in the user's memory.
--
--   imported    = saved from an import and untouched since.
--   in_progress = edited but not (yet, or not still) confirmed against the
--                 recording — the default for hand-created and freshly
--                 edited songs.
--   verified    = the user confirmed the map matches the track/chords/
--                 lyrics exactly. A deliberate claim, never inferred.
--
-- version_label is a free-text tag ("acoustic", "capo 3", "live") that
-- tells apart multiple songs.data for the same title/artist — see the
-- duplicate-clustering in app/songs/page.tsx.
alter table songs
  add column status text not null default 'in_progress'
    check (status in ('imported', 'in_progress', 'verified')),
  add column version_label text;

-- The status badge must never lie about untouched/verified state without
-- requiring every editor code path to remember to demote it. So: enforce
-- it in the database. Any update that changes the musical content (`data`)
-- knocks 'imported' or 'verified' back down to 'in_progress' — an edit
-- means the map is no longer known-untouched and no longer known-correct.
--
-- Explicit status changes (setSongStatus, which never touches `data`) are
-- unaffected by the `old.status in (...)` branch below since `data` is
-- unchanged. And if a single UPDATE statement somehow changes both `data`
-- and `status` in the same call, the caller's explicit status wins over
-- the auto-demotion — this trigger only acts when the statement itself
-- left `status` alone.
create or replace function songs_demote_status_on_edit()
returns trigger language plpgsql as $$
begin
  if new.data is distinct from old.data
     and old.status in ('imported', 'verified')
     and new.status is not distinct from old.status then
    new.status := 'in_progress';
  end if;
  return new;
end;
$$;

create trigger songs_demote_status_on_edit
  before update on songs
  for each row execute function songs_demote_status_on_edit();

-- Backfill: existing rows already default to 'in_progress' via the column
-- default applied to prior rows. Whether a pre-existing row was ever
-- actually hand-edited isn't knowable retroactively (we didn't track it),
-- so this is a heuristic, not a fact: rows that came from an import and
-- have never been updated since (updated_at == created_at, i.e. the
-- set_updated_at trigger never fired a change) are marked 'imported'.
-- Anything else — including old imports that were later edited — is left
-- at the 'in_progress' default, which is the safer wrong guess.
update songs
  set status = 'imported'
  where source_url is not null
    and updated_at is not distinct from created_at;
