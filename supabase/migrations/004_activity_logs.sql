create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_idx
  on public.activity_logs (actor_user_id);
create index if not exists activity_logs_action_idx
  on public.activity_logs (action);
create index if not exists activity_logs_entity_idx
  on public.activity_logs (entity_type, entity_id);

alter table public.activity_logs enable row level security;

revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;

drop policy if exists "Admins can read activity logs" on public.activity_logs;
create policy "Admins can read activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_admin());

create or replace function public.prevent_activity_log_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Activity logs are immutable';
end;
$$;

drop trigger if exists activity_logs_are_immutable on public.activity_logs;
create trigger activity_logs_are_immutable
before update or delete on public.activity_logs
for each row execute function public.prevent_activity_log_changes();

-- Product and variant screens can call this RPC immediately after a successful
-- mutation. Actor identity always comes from the authenticated session.
create or replace function public.record_activity(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_log_id bigint;
  v_actor_email text;
  v_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.active, u.email
    into v_active, v_actor_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid();

  if coalesce(v_active, false) is not true then
    raise exception 'Active account required';
  end if;

  if nullif(trim(p_action), '') is null
     or nullif(trim(p_entity_type), '') is null then
    raise exception 'Action and entity type are required';
  end if;

  insert into public.activity_logs (
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    auth.uid(),
    v_actor_email,
    upper(trim(p_action)),
    lower(trim(p_entity_type)),
    nullif(trim(p_entity_id), ''),
    p_before_data,
    p_after_data,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.record_activity(text, text, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.record_activity(text, text, text, jsonb, jsonb, jsonb)
  to authenticated;

