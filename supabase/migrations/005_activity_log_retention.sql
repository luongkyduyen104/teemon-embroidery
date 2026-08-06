-- Retain only the latest six months of activity logs.
-- The cleanup runs at 02:00 UTC (09:00 Vietnam time) on the first day of
-- every month.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.prevent_activity_log_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('app.activity_log_retention_cleanup', true) = 'on' then
    return old;
  end if;

  raise exception 'Activity logs are immutable';
end;
$$;

create or replace function public.purge_expired_activity_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  perform set_config('app.activity_log_retention_cleanup', 'on', true);

  delete from public.activity_logs
  where created_at < now() - interval '6 months';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_activity_logs()
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'purge-activity-logs-after-six-months'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'purge-activity-logs-after-six-months',
  '0 2 1 * *',
  $job$
    select public.purge_expired_activity_logs();
  $job$
);

-- Apply the retention rule immediately when this migration is installed.
select public.purge_expired_activity_logs();

