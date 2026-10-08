create table public.admin_config (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_notes_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_config where user_id = (select auth.uid())
  );
$$;

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  type text not null check (type in ('very_short', 'short', 'long')),
  question text not null check (length(trim(question)) > 0),
  answer text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_images (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  scope_type text not null check (scope_type in ('chapter', 'subject', 'question', 'semester')),
  scope_id uuid not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index subjects_semester_position_idx on public.subjects(semester_id, position);
create index chapters_subject_position_idx on public.chapters(subject_id, position);
create index questions_chapter_type_position_idx on public.questions(chapter_id, type, position);
create index questions_search_idx on public.questions using gin (to_tsvector('simple', question || ' ' || answer));
create index question_images_question_idx on public.question_images(question_id);
create index share_links_scope_idx on public.share_links(scope_type, scope_id) where is_active;
create index share_links_expiry_idx on public.share_links(expires_at) where is_active and expires_at is not null;

create or replace function public.touch_question_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger questions_updated_at
before update on public.questions
for each row execute function public.touch_question_updated_at();

alter table public.admin_config enable row level security;
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;
alter table public.questions enable row level security;
alter table public.question_images enable row level security;
alter table public.share_links enable row level security;

create policy "Only the configured admin accesses configuration"
on public.admin_config for select to authenticated using (public.is_notes_admin());
create policy "Only the admin manages semesters"
on public.semesters for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());
create policy "Only the admin manages subjects"
on public.subjects for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());
create policy "Only the admin manages chapters"
on public.chapters for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());
create policy "Only the admin manages questions"
on public.questions for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());
create policy "Only the admin manages question images"
on public.question_images for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());
create policy "Only the admin manages share links"
on public.share_links for all to authenticated using (public.is_notes_admin()) with check (public.is_notes_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Admin manages private question images"
on storage.objects for all to authenticated
using (bucket_id = 'question-images' and public.is_notes_admin())
with check (bucket_id = 'question-images' and public.is_notes_admin());

create or replace function public.deactivate_deleted_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_scope text;
begin
  deleted_scope := case tg_table_name
    when 'semesters' then 'semester'
    when 'subjects' then 'subject'
    when 'chapters' then 'chapter'
    when 'questions' then 'question'
  end;
  update public.share_links
  set is_active = false
  where scope_type = deleted_scope and scope_id = old.id and is_active;
  return old;
end;
$$;

create trigger semesters_revoke_shares
after delete on public.semesters
for each row execute function public.deactivate_deleted_shares();
create trigger subjects_revoke_shares
after delete on public.subjects
for each row execute function public.deactivate_deleted_shares();
create trigger chapters_revoke_shares
after delete on public.chapters
for each row execute function public.deactivate_deleted_shares();
create trigger questions_revoke_shares
after delete on public.questions
for each row execute function public.deactivate_deleted_shares();

create or replace function public.get_shared_content(share_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.share_links%rowtype;
  result jsonb;
begin
  select * into link
  from public.share_links
  where token = share_token
    and is_active
    and (expires_at is null or expires_at > now());

  if not found then
    return null;
  end if;

  if link.scope_type = 'question' then
    select jsonb_build_object('scope_type', link.scope_type, 'question', jsonb_build_object(
      'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer,
      'position', q.position, 'images', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'storage_path', i.storage_path) order by i.created_at)
        from public.question_images i where i.question_id = q.id
      ), '[]'::jsonb),
      'chapter', jsonb_build_object('id', c.id, 'name', c.name,
        'subject', jsonb_build_object('id', s.id, 'name', s.name,
          'semester', jsonb_build_object('id', se.id, 'name', se.name)))
    )) into result
    from public.questions q
    join public.chapters c on c.id = q.chapter_id
    join public.subjects s on s.id = c.subject_id
    join public.semesters se on se.id = s.semester_id
    where q.id = link.scope_id;
  elsif link.scope_type = 'chapter' then
    select jsonb_build_object('scope_type', link.scope_type, 'chapter',
      jsonb_build_object('id', c.id, 'name', c.name, 'subject', jsonb_build_object('id', s.id, 'name', s.name),
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
          'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'position', q.position,
          'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'storage_path', i.storage_path) order by i.created_at)
            from public.question_images i where i.question_id = q.id), '[]'::jsonb)
        ) order by q.position) from public.questions q where q.chapter_id = c.id), '[]'::jsonb))
    ) into result
    from public.chapters c join public.subjects s on s.id = c.subject_id
    where c.id = link.scope_id;
  elsif link.scope_type = 'subject' then
    select jsonb_build_object('scope_type', link.scope_type, 'subject',
      jsonb_build_object('id', s.id, 'name', s.name, 'semester', jsonb_build_object('id', se.id, 'name', se.name),
        'chapters', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'position', q.position,
            'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'storage_path', i.storage_path) order by i.created_at)
              from public.question_images i where i.question_id = q.id), '[]'::jsonb)
          ) order by q.position) from public.questions q where q.chapter_id = c.id), '[]'::jsonb)
        ) order by c.position) from public.chapters c where c.subject_id = s.id), '[]'::jsonb))
    ) into result
    from public.subjects s join public.semesters se on se.id = s.semester_id
    where s.id = link.scope_id;
  elsif link.scope_type = 'semester' then
    select jsonb_build_object('scope_type', link.scope_type, 'semester',
      jsonb_build_object('id', se.id, 'name', se.name,
        'subjects', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'chapters', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'name', c.name, 'questions', coalesce((select jsonb_agg(jsonb_build_object(
              'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'position', q.position,
              'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'storage_path', i.storage_path) order by i.created_at)
                from public.question_images i where i.question_id = q.id), '[]'::jsonb)
            ) order by q.position) from public.questions q where q.chapter_id = c.id), '[]'::jsonb)
          ) order by c.position) from public.chapters c where c.subject_id = s.id), '[]'::jsonb)
        ) order by s.position) from public.subjects s where s.semester_id = se.id), '[]'::jsonb))
    ) into result
    from public.semesters se where se.id = link.scope_id;
  end if;

  return result;
end;
$$;

revoke all on function public.get_shared_content(text) from public;
grant execute on function public.get_shared_content(text) to anon, authenticated, service_role;

revoke all on public.admin_config, public.semesters, public.subjects, public.chapters,
  public.questions, public.question_images, public.share_links from anon;
grant select on public.admin_config to authenticated;
grant select, insert, update, delete on public.semesters, public.subjects, public.chapters,
  public.questions, public.question_images, public.share_links to authenticated;
