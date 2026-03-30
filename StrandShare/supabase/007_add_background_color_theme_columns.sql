-- 007_add_background_color_theme_columns.sql
-- Adds global background color support to theme tables.

alter table if exists public."UI_Settings"
  add column if not exists "Background_Color" varchar(20);

alter table if exists public."Theme_Presets"
  add column if not exists "Background_Color" varchar(20);

update public."UI_Settings"
set "Background_Color" = '#f4f7fb'
where coalesce("Background_Color", '') = '';

update public."Theme_Presets"
set "Background_Color" = '#f4f7fb'
where coalesce("Background_Color", '') = ''
  and coalesce("Is_Default", false) = false;
