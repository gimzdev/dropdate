-- Games can also come from IGDB (igdb-123).
alter table dd_game drop constraint if exists dd_game_key_check;
alter table dd_game add constraint dd_game_key_check check (key ~ '^(steam|igdb|ps)-[0-9]{1,12}$');
