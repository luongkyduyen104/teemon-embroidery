create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid not null references public.colors(id),
  size_id uuid not null references public.sizes(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, color_id, size_id)
);

alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon, authenticated;
grant select on public.product_variants to authenticated;
drop policy if exists "Active users can read product variants" on public.product_variants;
create policy "Active users can read product variants" on public.product_variants
for select to authenticated using (public.is_active_user());

create or replace function public.create_inline_product_option(p_type text, p_name text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare v_name text := trim(p_name); v_code text; v_id uuid; v_order integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if nullif(v_name, '') is null then raise exception 'Option name is required'; end if;
  if lower(trim(p_type)) not in ('color', 'size') then raise exception 'Option type must be color or size'; end if;

  if lower(trim(p_type)) = 'color' then
    select id into v_id from public.colors where lower(name) = lower(v_name) limit 1;
    if v_id is not null then
      update public.colors set is_active = true, updated_at = now() where id = v_id;
    else
      v_code := nullif(regexp_replace(upper(v_name), '[^A-Z0-9]+', '-', 'g'), '');
      v_code := trim(both '-' from coalesce(v_code, 'COLOR'));
      while exists(select 1 from public.colors where lower(code) = lower(v_code)) loop
        v_code := left(v_code, 45) || '-' || floor(random() * 900 + 100)::integer::text;
      end loop;
      insert into public.colors(code, name, hex_code) values(v_code, v_name, null) returning id into v_id;
    end if;
    return jsonb_build_object('id', v_id, 'name', v_name, 'type', 'color');
  end if;

  select id into v_id from public.sizes where lower(name) = lower(v_name) limit 1;
  if v_id is not null then
    update public.sizes set is_active = true, updated_at = now() where id = v_id;
  else
    v_code := nullif(regexp_replace(upper(v_name), '[^A-Z0-9]+', '-', 'g'), '');
    v_code := trim(both '-' from coalesce(v_code, 'SIZE'));
    while exists(select 1 from public.sizes where lower(code) = lower(v_code)) loop
      v_code := left(v_code, 45) || '-' || floor(random() * 900 + 100)::integer::text;
    end loop;
    select coalesce(max(display_order), 0) + 10 into v_order from public.sizes;
    insert into public.sizes(code, name, display_order) values(v_code, v_name, v_order) returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'name', v_name, 'type', 'size');
end;
$$;

create or replace function public.sync_product_variants(p_product_id uuid)
returns integer language plpgsql security definer set search_path = public, auth
as $$
declare v_count integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  insert into public.product_variants(product_id, color_id, size_id)
  select p_product_id, pc.color_id, ps.size_id
  from public.product_colors pc cross join public.product_sizes ps
  where pc.product_id = p_product_id and ps.product_id = p_product_id
  on conflict(product_id, color_id, size_id) do update set active = true, updated_at = now();

  update public.product_variants pv set active = false, updated_at = now()
  where pv.product_id = p_product_id and (
    not exists(select 1 from public.product_colors pc where pc.product_id=p_product_id and pc.color_id=pv.color_id)
    or not exists(select 1 from public.product_sizes ps where ps.product_id=p_product_id and ps.size_id=pv.size_id)
  );
  select count(*) into v_count from public.product_variants where product_id=p_product_id and active=true;
  return v_count;
end;
$$;

create or replace function public.sync_variants_after_product_option_change()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  perform public.sync_product_variants(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_colors_sync_variants on public.product_colors;
create trigger product_colors_sync_variants after insert or delete on public.product_colors
for each row execute function public.sync_variants_after_product_option_change();
drop trigger if exists product_sizes_sync_variants on public.product_sizes;
create trigger product_sizes_sync_variants after insert or delete on public.product_sizes
for each row execute function public.sync_variants_after_product_option_change();

revoke all on function public.create_inline_product_option(text,text) from public,anon;
revoke all on function public.sync_product_variants(uuid) from public,anon;
grant execute on function public.create_inline_product_option(text,text) to authenticated;
grant execute on function public.sync_product_variants(uuid) to authenticated;

insert into public.product_variants(product_id, color_id, size_id)
select pc.product_id, pc.color_id, ps.size_id
from public.product_colors pc
join public.product_sizes ps on ps.product_id = pc.product_id
on conflict(product_id, color_id, size_id) do nothing;
notify pgrst, 'reload schema';
