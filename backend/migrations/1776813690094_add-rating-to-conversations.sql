-- Up Migration
alter table conversations
  add column rating smallint check (rating in (-1, 1));

-- Down Migration
alter table conversations drop column rating;
