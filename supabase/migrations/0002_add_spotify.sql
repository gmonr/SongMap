-- Spotify verification mode: link each song to a Spotify track and store
-- the recording-sync state (calibration anchors mapping beats to track
-- milliseconds). Kept out of the `data` blob on purpose — `data` is musical
-- content rewritten wholesale by the editors, while sync state is saved by
-- tiny targeted updates that must never clobber chord edits.
alter table songs
  add column spotify_track_id text,
  add column spotify_sync jsonb;
