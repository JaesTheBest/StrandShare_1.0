-- 073_split_event_place_and_poster_photos.sql
-- Separate event place proof photo from poster/publicity photo in Event_Applications.

begin;

alter table public."Event_Applications"
  add column if not exists "Event_Poster_Photo_Path" character varying(500),
  add column if not exists "Event_Poster_Photo_URL" character varying(500);

-- Backfill: previous UI temporarily used Event_Place_Photo_* for poster uploads.
-- Keep existing data visible by copying into new poster columns when poster is empty.
update public."Event_Applications"
set
  "Event_Poster_Photo_Path" = coalesce(nullif(trim("Event_Poster_Photo_Path"), ''), nullif(trim("Event_Place_Photo_Path"), '')),
  "Event_Poster_Photo_URL" = coalesce(nullif(trim("Event_Poster_Photo_URL"), ''), nullif(trim("Event_Place_Photo_URL"), ''))
where
  (coalesce(trim("Event_Poster_Photo_Path"), '') = '' and coalesce(trim("Event_Place_Photo_Path"), '') <> '')
  or
  (coalesce(trim("Event_Poster_Photo_URL"), '') = '' and coalesce(trim("Event_Place_Photo_URL"), '') <> '');

commit;

