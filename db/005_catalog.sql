-- IGDB is the game database. Games saved from the earlier source cannot be opened or refreshed any more, so they leave the libraries.
delete from dd_library where game_key !~ '^(steam|igdb|ps)-[0-9]{1,12}$';
delete from dd_game where key !~ '^(steam|igdb|ps)-[0-9]{1,12}$';
alter table dd_game drop constraint if exists dd_game_key_check;
alter table dd_game add constraint dd_game_key_check check (key ~ '^(steam|igdb|ps)-[0-9]{1,12}$');
