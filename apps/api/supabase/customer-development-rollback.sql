-- Manual development-only rollback for migration 0024 BEFORE any customer data
-- is created. Run only through an independently verified development connection.
-- Production is never an authorized target. No automatic rollback is invoked.
begin;
lock table public.customer_profiles, public.customer_libraries in access exclusive mode;
do $$ begin
  if exists(select 1 from public.customer_profiles) or exists(select 1 from public.customer_libraries) then
    raise exception 'Customer data exists. Retain the additive schema and roll back code or prepare a reviewed data-preserving repair.';
  end if;
end $$;
drop function public.provision_customer_account(uuid,text,text,text);
drop function public.update_customer_profile(text,jsonb);
drop function public.clear_customer_library(text);
drop table public.customer_libraries;
drop table public.customer_profiles;
delete from public.schema_migrations where filename='0024_customer_accounts_library.sql';
notify pgrst, 'reload schema';
commit;
