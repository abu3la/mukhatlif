begin;
create table public.registration_forms (
 id uuid primary key, definition jsonb not null,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.registration_responses (
 id uuid primary key default gen_random_uuid(),
 form_id uuid not null references public.registration_forms(id),
 request_id uuid not null, answers jsonb not null, fields jsonb not null,
 search_text text not null, privacy_accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now(), unique(form_id,request_id)
);
create index registration_responses_form_created on public.registration_responses(form_id,created_at desc,id);
alter table public.registration_forms enable row level security;
alter table public.registration_responses enable row level security;
revoke all on public.registration_forms,public.registration_responses from public,anon,authenticated;
grant all on public.registration_forms,public.registration_responses to service_role;

create function public.registration_save(p_definition jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare current_revision integer; next_revision integer; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_definition->>'id',726));
 select revision into current_revision from registration_forms where id=(p_definition->>'id')::uuid for update;
 if coalesce(current_revision,0) <> (p_definition->>'revision')::integer then raise exception 'registration_conflict'; end if;
 next_revision=coalesce(current_revision,0)+1;
 result=jsonb_set(p_definition,'{revision}',to_jsonb(next_revision));
 insert into registration_forms(id,definition,revision) values((result->>'id')::uuid,result,next_revision)
 on conflict(id) do update set definition=excluded.definition,revision=excluded.revision,updated_at=now();
 return result;
end $$;
create function public.registration_submit(p_form uuid,p_revision integer,p_request uuid,p_answers jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare form jsonb;
begin
 select definition into form from registration_forms where id=p_form for update;
 -- Retrying an acknowledged request must not create a second registration.
 if exists(select 1 from registration_responses where form_id=p_form and request_id=p_request) then return; end if;
 if form is null or form->>'status'<>'published' then raise exception 'registration_closed'; end if;
 if (form->>'revision')::integer <> p_revision then raise exception 'registration_conflict'; end if;
 insert into registration_responses(form_id,request_id,answers,fields,search_text)
 values(p_form,p_request,p_answers,form->'fields',p_answers::text);
end $$;
revoke all on function public.registration_save(jsonb),public.registration_submit(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.registration_save(jsonb),public.registration_submit(uuid,integer,uuid,jsonb) to service_role;
insert into public.schema_migrations(filename) values ('0026_registration_forms.sql') on conflict do nothing;
commit;
