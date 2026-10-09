-- The library: what each person wishlisted or played, and a small shared cache of those games' public details.

-- Public game and tournament details (not personal data). Kept so a library opens instantly without calling the
-- data sources for every game. Filled when someone saves a game and refreshed on a schedule.
create table if not exists dd_game (
  key text primary key check (key ~ '^(rawg|steam|ps)-[0-9]{1,12}$'),
  kind text not null check (kind in ('release', 'tournament')),
  title text not null,
  slug text,
  url text,
  thumb text not null default '',
  starts_on date,
  ends_on date,
  tba boolean not null default false,
  platforms text[] not null default '{}',
  genres text[] not null default '{}',
  metacritic smallint check (metacritic between 0 and 100),
  prize text,
  refreshed_at timestamptz not null default now()
);

-- One row per person and game. A game can be wishlisted, played, or both. A row with neither flag does not exist.
create table if not exists dd_library (
  user_id text not null references "user" ("id") on delete cascade,
  game_key text not null references dd_game (key) on delete restrict,
  wishlisted_at timestamptz,
  played_at timestamptz,
  primary key (user_id, game_key),
  check (wishlisted_at is not null or played_at is not null)
);
create index if not exists dd_library_wishlist_idx on dd_library (user_id, wishlisted_at desc) where wishlisted_at is not null;
create index if not exists dd_library_played_idx on dd_library (user_id, played_at desc) where played_at is not null;
create index if not exists dd_library_game_idx on dd_library (game_key);

-- Rate-limit counters. Keys are salted hashes, so no address or email is kept in readable form.
create table if not exists dd_throttle (
  key text primary key,
  hits integer not null,
  started_at timestamptz not null default now()
);
create index if not exists dd_throttle_started_idx on dd_throttle (started_at);
