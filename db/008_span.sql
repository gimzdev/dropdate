-- A release known only by its quarter or its year ("Q2 2027", "2027"): starts_on is the last day of it, tba is true, and span says
-- which of the two it is (null: a day, or a month). Added only, nullable, no default: no row is rewritten, nothing is dropped,
-- and the app reads and writes with or without the column (lib/library.ts, hasSpan). One table a file: each file is one
-- transaction, so this one waits for one table only.
alter table dd_game add column if not exists span text; -- 'quarter' | 'year' | null
