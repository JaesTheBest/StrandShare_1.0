-- 081_add_social_page_name_to_event_applications.sql
-- Capture the social media display name on the public Event Application form
-- so the staff intake can hand it off as Event_Requests.Partnered_With.

begin;

alter table public."Event_Applications"
  add column if not exists "Social_Page_Name" character varying(255);

commit;
