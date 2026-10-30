-- PostgreSQL enum values cannot be used until the transaction that creates
-- them commits. Keep this migration separate from 0027, which depends on them.

alter type public.studio_permission add value if not exists 'courses.view';
alter type public.studio_permission add value if not exists 'courses.manage';

insert into public.schema_migrations (filename)
values ('0026_academy_permissions.sql')
on conflict do nothing;
