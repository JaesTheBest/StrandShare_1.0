-- 015_add_wig_request_preview_pdf_url_column.sql
-- Add Pdf_Url to Wig_Requests so submitted rows can open stored PDF previews.
-- If a legacy Preview_Pdf_Url exists, rename it to Pdf_Url.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wig_Requests'
      and column_name = 'Preview_Pdf_Url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wig_Requests'
      and column_name = 'Pdf_Url'
  ) then
    alter table public."Wig_Requests"
      rename column "Preview_Pdf_Url" to "Pdf_Url";
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wig_Requests'
      and column_name = 'Pdf_Url'
  ) then
    alter table public."Wig_Requests"
      add column "Pdf_Url" text;
  end if;
end
$$;
