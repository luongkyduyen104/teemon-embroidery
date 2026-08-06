alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set
    must_change_password = false,
    updated_at = now()
  where id = (select auth.uid())
    and active = true;
end;
$$;

revoke all on function public.complete_password_change() from public;
grant execute on function public.complete_password_change() to authenticated;
