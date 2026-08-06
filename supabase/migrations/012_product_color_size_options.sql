create table if not exists public.product_colors (
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid not null references public.colors(id),
  created_at timestamptz not null default now(),
  primary key (product_id, color_id)
);

create table if not exists public.product_sizes (
  product_id uuid not null references public.products(id) on delete cascade,
  size_id uuid not null references public.sizes(id),
  created_at timestamptz not null default now(),
  primary key (product_id, size_id)
);

alter table public.product_colors enable row level security;
alter table public.product_sizes enable row level security;

revoke all on public.product_colors, public.product_sizes from anon, authenticated;
grant select on public.product_colors, public.product_sizes to authenticated;

drop policy if exists "Active users can read product colors" on public.product_colors;
create policy "Active users can read product colors"
on public.product_colors for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

drop policy if exists "Active users can read product sizes" on public.product_sizes;
create policy "Active users can read product sizes"
on public.product_sizes for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

create or replace function public.set_product_options(
  p_product_id uuid,
  p_color_ids uuid[],
  p_size_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found';
  end if;
  if coalesce(cardinality(p_color_ids), 0) = 0 then
    raise exception 'Select at least one color';
  end if;
  if coalesce(cardinality(p_size_ids), 0) = 0 then
    raise exception 'Select at least one size';
  end if;
  if exists (
    select 1 from unnest(p_color_ids) item(id)
    where not exists (
      select 1 from public.colors where colors.id = item.id and is_active = true
    )
  ) then
    raise exception 'One or more selected colors are unavailable';
  end if;
  if exists (
    select 1 from unnest(p_size_ids) item(id)
    where not exists (
      select 1 from public.sizes where sizes.id = item.id and is_active = true
    )
  ) then
    raise exception 'One or more selected sizes are unavailable';
  end if;

  delete from public.product_colors where product_id = p_product_id;
  insert into public.product_colors (product_id, color_id)
  select p_product_id, id from unnest(p_color_ids) item(id);

  delete from public.product_sizes where product_id = p_product_id;
  insert into public.product_sizes (product_id, size_id)
  select p_product_id, id from unnest(p_size_ids) item(id);
end;
$$;

create or replace function public.create_draft_product_with_options(
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_code text,
  p_short_description text,
  p_description text,
  p_color_ids uuid[],
  p_size_ids uuid[]
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.products;
begin
  v_product := public.create_draft_product_by_category_code(
    p_product_code, p_product_name, p_slug, p_category_code,
    p_short_description, p_description
  );
  perform public.set_product_options(v_product.id, p_color_ids, p_size_ids);
  return v_product;
end;
$$;

create or replace function public.update_product_with_options(
  p_product_id uuid,
  p_expected_version integer,
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_code text,
  p_short_description text,
  p_description text,
  p_color_ids uuid[],
  p_size_ids uuid[]
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.products;
begin
  v_product := public.update_product_basic_by_category_code(
    p_product_id, p_expected_version, p_product_code, p_product_name,
    p_slug, p_category_code, p_short_description, p_description
  );
  perform public.set_product_options(v_product.id, p_color_ids, p_size_ids);
  return v_product;
end;
$$;

revoke all on function public.set_product_options(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.create_draft_product_with_options(
  text, text, text, text, text, text, uuid[], uuid[]
) from public, anon;
revoke all on function public.update_product_with_options(
  uuid, integer, text, text, text, text, text, text, uuid[], uuid[]
) from public, anon;

grant execute on function public.set_product_options(uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.create_draft_product_with_options(
  text, text, text, text, text, text, uuid[], uuid[]
) to authenticated;
grant execute on function public.update_product_with_options(
  uuid, integer, text, text, text, text, text, text, uuid[], uuid[]
) to authenticated;
