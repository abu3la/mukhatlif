-- PostgreSQL enum values cannot be used until the transaction that creates
-- them commits. Keep this migration separate from 0018, which seeds and uses
-- the new permissions.

alter type public.studio_permission add value if not exists 'forms.view';
alter type public.studio_permission add value if not exists 'forms.manage';
