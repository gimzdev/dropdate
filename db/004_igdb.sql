-- Games can also come from IGDB (keys like igdb-123). The key check on dd_game allowed three sources: this adds the fourth.
alter table dd_game drop constraint if exists dd_game_key_check;
alter table dd_game add constraint dd_game_key_check check (key ~ '^(rawg|steam|igdb|ps)-[0-9]{1,12}$');
