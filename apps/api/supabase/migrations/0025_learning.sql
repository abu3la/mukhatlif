-- Learning is owned by the shared Hono API. No browser role can read answer keys.
begin;
create table public.learning_courses (
 id text primary key, definition jsonb not null, revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table public.learning_enrollments (
 course_id text not null references public.learning_courses(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 member_name text not null, state jsonb not null, revision bigint not null default 1,
 updated_at timestamptz not null default now(), primary key(course_id,user_id)
);
create table public.learning_assets (
 id text primary key, course_id text not null references public.learning_courses(id),
 object_key text not null unique, filename text not null, size bigint not null,
 mime text not null, ready boolean not null default false,
 owner_id uuid references auth.users(id) on delete set null, upload_id text, parts jsonb not null default '[]', received bigint not null default 0,
 created_at timestamptz not null default now()
);
create table public.learning_media_tickets (
 id uuid primary key, course_id text not null references public.learning_courses(id),
 file text not null, user_id uuid references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
create index learning_media_tickets_expiry on public.learning_media_tickets(expires_at);
create index learning_enrollments_user on public.learning_enrollments(user_id);
create index learning_assets_course on public.learning_assets(course_id);
alter table public.learning_media_tickets enable row level security;
revoke all on public.learning_media_tickets from public, anon, authenticated;
grant all on public.learning_media_tickets to service_role;
alter table public.learning_courses enable row level security;
alter table public.learning_enrollments enable row level security;
alter table public.learning_assets enable row level security;
revoke all on public.learning_courses, public.learning_enrollments, public.learning_assets from public, anon, authenticated;
grant all on public.learning_courses, public.learning_enrollments, public.learning_assets to service_role;

-- Serialize course edits with enrollment creation. Never change requirements under a learner.
create function public.learning_save_course(p_definition jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare old jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_definition->>'id',0));
 select definition into old from learning_courses where id=p_definition->>'id' for update;
 if old is not null and exists(select 1 from learning_enrollments where course_id=p_definition->>'id') and
   (old->'lessons',old->'resources',old->'quiz',old->'assignment') is distinct from
   (p_definition->'lessons',p_definition->'resources',p_definition->'quiz',p_definition->'assignment') then
   raise exception 'learning_curriculum_locked';
 end if;
 insert into learning_courses(id,definition) values(p_definition->>'id',p_definition)
 on conflict(id) do update set definition=excluded.definition,revision=learning_courses.revision+1,updated_at=now();
 return p_definition;
end $$;
create function public.learning_enroll(p_course text,p_user uuid,p_name text,p_state jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare course jsonb; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_course,0));
 select definition into course from learning_courses where id=p_course for update;
 if course is null or not (course->>'published')::boolean then raise exception 'learning_unavailable'; end if;
 -- Price is read under the same lock as the enrollment, never trusted from a browser.
 p_state=jsonb_set(p_state,'{order,amount}',course->'price');
 insert into learning_enrollments(course_id,user_id,member_name,state) values(p_course,p_user,p_name,p_state)
 on conflict(course_id,user_id) do nothing;
 select state into result from learning_enrollments where course_id=p_course and user_id=p_user;
 return result;
end $$;
revoke all on function public.learning_save_course(jsonb), public.learning_enroll(text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.learning_save_course(jsonb), public.learning_enroll(text,uuid,text,jsonb) to service_role;
insert into public.schema_migrations(filename) values ('0025_learning.sql') on conflict do nothing;
commit;
