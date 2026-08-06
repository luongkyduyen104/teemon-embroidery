create or replace function public.save_color(
  p_id uuid,
  p_code text,
  p_name text,
  p_hex_code text
)
returns public.colors
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.colors;
  v_after public.colors;
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;
  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Color code and name are required';
  end if;
  if nullif(trim(p_hex_code), '') is not null
     and trim(p_hex_code) !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'HEX color must use format #RRGGBB';
  end if;

  if p_id is null then
    insert into public.colors (code, name, hex_code)
    values (
      upper(trim(p_code)),
      trim(p_name),
      upper(nullif(trim(p_hex_code), ''))
    )
    returning * into v_after;
  else
    select * into v_before from public.colors where id = p_id for update;
    if not found then raise exception 'Color not found'; end if;

    update public.colors
    set
      code = upper(trim(p_code)),
      name = trim(p_name),
      hex_code = upper(nullif(trim(p_hex_code), '')),
      updated_at = now()
    where id = p_id
    returning * into v_after;
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs (
    actor_user_id, actor_email, action, entity_type, entity_id,
    before_data, after_data, metadata
  )
  values (
    auth.uid(), v_actor_email,
    case when p_id is null then 'CREATE_COLOR' else 'UPDATE_COLOR' end,
    'color', v_after.id::text,
    case when p_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    jsonb_build_object('source', 'variants_master_data')
  );
  return v_after;
exception
  when unique_violation then raise exception 'Color code already exists';
end;
$$;

create or replace function public.set_color_active(
  p_id uuid,
  p_active boolean
)
returns public.colors
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.colors;
  v_after public.colors;
  v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_before from public.colors where id = p_id for update;
  if not found then raise exception 'Color not found'; end if;

  update public.colors
  set is_active = p_active, updated_at = now()
  where id = p_id returning * into v_after;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs (
    actor_user_id, actor_email, action, entity_type, entity_id,
    before_data, after_data, metadata
  )
  values (
    auth.uid(), v_actor_email,
    case when p_active then 'ACTIVATE_COLOR' else 'DEACTIVATE_COLOR' end,
    'color', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('source', 'variants_master_data')
  );
  return v_after;
end;
$$;

create or replace function public.save_size(
  p_id uuid,
  p_code text,
  p_name text,
  p_display_order integer
)
returns public.sizes
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.sizes;
  v_after public.sizes;
  v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Size code and name are required';
  end if;

  if p_id is null then
    insert into public.sizes (code, name, display_order)
    values (upper(trim(p_code)), trim(p_name), greatest(coalesce(p_display_order, 0), 0))
    returning * into v_after;
  else
    select * into v_before from public.sizes where id = p_id for update;
    if not found then raise exception 'Size not found'; end if;

    update public.sizes
    set
      code = upper(trim(p_code)),
      name = trim(p_name),
      display_order = greatest(coalesce(p_display_order, 0), 0),
      updated_at = now()
    where id = p_id
    returning * into v_after;
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs (
    actor_user_id, actor_email, action, entity_type, entity_id,
    before_data, after_data, metadata
  )
  values (
    auth.uid(), v_actor_email,
    case when p_id is null then 'CREATE_SIZE' else 'UPDATE_SIZE' end,
    'size', v_after.id::text,
    case when p_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    jsonb_build_object('source', 'variants_master_data')
  );
  return v_after;
exception
  when unique_violation then raise exception 'Size code already exists';
end;
$$;

create or replace function public.set_size_active(
  p_id uuid,
  p_active boolean
)
returns public.sizes
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.sizes;
  v_after public.sizes;
  v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_before from public.sizes where id = p_id for update;
  if not found then raise exception 'Size not found'; end if;

  update public.sizes
  set is_active = p_active, updated_at = now()
  where id = p_id returning * into v_after;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs (
    actor_user_id, actor_email, action, entity_type, entity_id,
    before_data, after_data, metadata
  )
  values (
    auth.uid(), v_actor_email,
    case when p_active then 'ACTIVATE_SIZE' else 'DEACTIVATE_SIZE' end,
    'size', v_after.id::text, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('source', 'variants_master_data')
  );
  return v_after;
end;
$$;

revoke all on function public.save_color(uuid, text, text, text) from public, anon;
revoke all on function public.set_color_active(uuid, boolean) from public, anon;
revoke all on function public.save_size(uuid, text, text, integer) from public, anon;
revoke all on function public.set_size_active(uuid, boolean) from public, anon;
grant execute on function public.save_color(uuid, text, text, text) to authenticated;
grant execute on function public.set_color_active(uuid, boolean) to authenticated;
grant execute on function public.save_size(uuid, text, text, integer) to authenticated;
grant execute on function public.set_size_active(uuid, boolean) to authenticated;

