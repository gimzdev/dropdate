-- With told_on and told_tba: the span of the date the person last heard from "Tell me" ('quarter' | 'year' | null), so a year
-- that becomes a quarter is news and a date only named better is not. Added only, nullable, no default (see 008_span.sql).
alter table dd_library add column if not exists told_span text;
