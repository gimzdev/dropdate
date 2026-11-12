-- "Tell me": a saved game whose release day, and any change to its date, is emailed to the person who asked. Off until asked for.
alter table dd_library add column if not exists tell_at timestamptz; -- when it was asked for; null: off
alter table dd_library add column if not exists told_on date; -- the date the person last heard, or saw when asking (null: none)
alter table dd_library add column if not exists told_tba boolean not null default false; -- that date was only a month
alter table dd_library add column if not exists told_out boolean not null default false; -- the release-day email went out
alter table dd_library drop constraint if exists dd_library_tell_needs_wishlist;
alter table dd_library add constraint dd_library_tell_needs_wishlist check (tell_at is null or wishlisted_at is not null);
create index if not exists dd_library_tell_idx on dd_library (game_key) where tell_at is not null and not told_out;
