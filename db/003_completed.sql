-- "Completed": a game someone has played through to the end. A completed game is always a played game, so the database
-- itself refuses a completed date on a row that is not marked as played. Nothing existing changes: every row starts as not completed.
alter table dd_library add column if not exists completed_at timestamptz;
alter table dd_library drop constraint if exists dd_library_completed_needs_played;
alter table dd_library add constraint dd_library_completed_needs_played check (completed_at is null or played_at is not null);
create index if not exists dd_library_completed_idx on dd_library (user_id, completed_at desc) where completed_at is not null;
