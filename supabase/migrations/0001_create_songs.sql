-- SongMap: songs table. Flat, queryable metadata as real columns; the
-- sections + arrangement blob (see lib/song/types.ts SongData) as jsonb.
create table songs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null default auth.uid(),
  title          text not null,
  artist         text,
  key            text,
  time_signature text default '4/4',
  tempo          int,
  capo           int default 0,
  data           jsonb not null,
  source_url     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table songs enable row level security;

create policy "own songs" on songs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at fresh on every write.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger songs_set_updated_at
  before update on songs
  for each row execute function set_updated_at();
