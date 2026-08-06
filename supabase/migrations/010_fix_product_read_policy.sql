-- Avoid chaining the products RLS policy through profiles RLS. The helper runs
-- with its owner's permissions and returns only a boolean.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

drop policy if exists "Active users can read products" on public.products;
drop policy if exists "Authenticated active users can read products" on public.products;
create policy "Authenticated active users can read products"
on public.products
for select
to authenticated
using (public.is_active_user());

