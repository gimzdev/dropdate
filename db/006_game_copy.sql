-- The last good copy of each game page, shown when IGDB or Steam does not answer.
create table if not exists dd_game_copy (slug text primary key, data jsonb not null, kept_at timestamptz not null default now());
