begin;

create table public.app_settings (
  id boolean primary key default true check (id),
  language text not null default 'en' check (language in ('en', 'bn'))
);

insert into public.app_settings (id, language) values (true, 'en');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
    ) then
    execute 'alter publication supabase_realtime add table public.app_settings';
  end if;
end;
$$;

alter table public.app_settings enable row level security;

create policy "Only admins manage app settings"
on public.app_settings for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());

revoke all on public.app_settings from anon;
grant select, update on public.app_settings to authenticated;

commit;
