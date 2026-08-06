-- Align user roles with Product Catalog System Specification v1.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'staff'
  ) and not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'sales'
  ) then
    alter type public.user_role rename value 'staff' to 'sales';
  end if;
end
$$;

alter type public.user_role add value if not exists 'sales';
alter type public.user_role add value if not exists 'warehouse';

alter table public.profiles
  add column if not exists is_root_admin boolean not null default false;

alter table public.profiles
  alter column role set default 'sales';

create index if not exists profiles_role_idx on public.profiles(role);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, email, full_name, role, active, is_root_admin
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'sales',
    true,
    false
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

update public.profiles
set
  role = 'admin',
  is_root_admin = true,
  active = true,
  updated_at = now()
where email = 'luongkyduyen.teemon@gmail.com';
