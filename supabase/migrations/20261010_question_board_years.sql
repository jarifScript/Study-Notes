begin;

alter table public.questions
  add column board_years integer[] not null default '{}';

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
      'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'board_years', q.board_years,
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
          'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'board_years', q.board_years, 'position', q.position,
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
            'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'board_years', q.board_years, 'position', q.position,
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
              'id', q.id, 'type', q.type, 'question', q.question, 'answer', q.answer, 'board_years', q.board_years, 'position', q.position,
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

commit;
