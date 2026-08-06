create table if not exists public.product_size_fulfillment (
  product_id uuid not null references public.products(id) on delete cascade,
  size_id uuid not null references public.sizes(id),
  weight_grams numeric(12,2),
  base_cost numeric(12,2),
  shipping_estimates jsonb not null default '{}'::jsonb,
  currency text not null default 'USD',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (product_id, size_id),
  constraint fulfillment_weight_positive check (weight_grams is null or weight_grams > 0),
  constraint fulfillment_base_cost_nonnegative check (base_cost is null or base_cost >= 0),
  constraint fulfillment_shipping_estimates_object check (jsonb_typeof(shipping_estimates) = 'object'),
  constraint fulfillment_currency_format check (currency ~ '^[A-Z]{3}$')
);

drop function if exists public.admin_product_fulfillment(uuid);
alter table public.product_size_fulfillment
  add column if not exists base_cost numeric(12,2),
  add column if not exists shipping_estimates jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fulfillment_base_cost_nonnegative'
  ) then
    alter table public.product_size_fulfillment
      add constraint fulfillment_base_cost_nonnegative check (base_cost is null or base_cost >= 0);
  end if;
end;
$$;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'product_size_fulfillment' and column_name = 'shipping_price'
  ) then
    execute 'update public.product_size_fulfillment
      set shipping_estimates = jsonb_build_object(''rest_of_world'', shipping_price)
      where shipping_price is not null and shipping_estimates = ''{}''::jsonb';
    execute 'alter table public.product_size_fulfillment drop column shipping_price';
  end if;
end;
$$;

alter table public.product_size_fulfillment enable row level security;
revoke all on public.product_size_fulfillment from anon, authenticated;

create or replace function public.admin_product_fulfillment(p_product_id uuid)
returns table(size_id uuid, size_code text, size_name text, display_order integer, weight_grams numeric, base_cost numeric, shipping_estimates jsonb, currency text)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return query
  select s.id, s.code, s.name, s.display_order, f.weight_grams, f.base_cost, coalesce(f.shipping_estimates, '{}'::jsonb), coalesce(f.currency, 'USD')
  from public.product_sizes ps
  join public.sizes s on s.id = ps.size_id
  left join public.product_size_fulfillment f on f.product_id = ps.product_id and f.size_id = ps.size_id
  where ps.product_id = p_product_id
  order by s.display_order, s.name;
end;
$$;

create or replace function public.save_product_fulfillment(p_product_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'Product not found'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Fulfillment rows must be an array'; end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as row_data(size_id uuid, weight_grams numeric, base_cost numeric, shipping_estimates jsonb, currency text)
    where not exists (
      select 1 from public.product_sizes ps where ps.product_id = p_product_id and ps.size_id = row_data.size_id
    )
  ) then raise exception 'Fulfillment contains a size that is not selected for this product'; end if;

  delete from public.product_size_fulfillment where product_id = p_product_id;
  insert into public.product_size_fulfillment(product_id, size_id, weight_grams, base_cost, shipping_estimates, currency, updated_by)
  select p_product_id, row_data.size_id, row_data.weight_grams, row_data.base_cost, coalesce(row_data.shipping_estimates, '{}'::jsonb),
    upper(coalesce(nullif(trim(row_data.currency), ''), 'USD')), auth.uid()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as row_data(size_id uuid, weight_grams numeric, base_cost numeric, shipping_estimates jsonb, currency text);

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs(actor_user_id, actor_email, action, entity_type, entity_id, after_data, metadata)
  values (auth.uid(), v_actor_email, 'UPDATE_FULFILLMENT', 'product', p_product_id::text,
    jsonb_build_object('rows', coalesce(p_rows, '[]'::jsonb)), jsonb_build_object('source', 'product_edit_page'));
end;
$$;

create or replace function public.authorized_product_fulfillment(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare v_active boolean; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select active into v_active from public.profiles where id = auth.uid();
  if coalesce(v_active, false) is not true then raise exception 'Active account required'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'size_code', s.code, 'size_name', s.name, 'weight_grams', f.weight_grams,
      'base_cost', f.base_cost, 'shipping_estimates', f.shipping_estimates, 'currency', f.currency
    )
    order by s.display_order, s.name
  ), '[]'::jsonb)
  into v_result
  from public.products p
  join public.product_size_fulfillment f on f.product_id = p.id
  join public.sizes s on s.id = f.size_id
  where lower(p.slug) = lower(trim(p_slug)) and p.publication_status = 'PUBLISHED';
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.public_product_weights(p_slug text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'size_code', s.code, 'size_name', s.name, 'weight_grams', f.weight_grams
  ) order by s.display_order, s.name), '[]'::jsonb)
  from public.products p
  join public.product_size_fulfillment f on f.product_id = p.id
  join public.sizes s on s.id = f.size_id
  where lower(p.slug) = lower(trim(p_slug))
    and p.publication_status = 'PUBLISHED';
$$;

create or replace function public.public_product_detail(p_slug text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'product_code', p.product_code, 'product_name', p.product_name,
    'slug', p.slug, 'short_description', p.short_description, 'description', p.description,
    'category_name', c.name,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'url', pi.image_url, 'alt_text', pi.alt_text, 'is_thumbnail', pi.is_thumbnail
      ) order by pi.is_thumbnail desc, pi.display_order, pi.created_at)
      from public.product_images pi where pi.product_id = p.id
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', color.code, 'name', color.name, 'hex_code', color.hex_code
      ) order by color.name)
      from public.product_colors pc join public.colors color on color.id = pc.color_id
      where pc.product_id = p.id and color.is_active = true
    ), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object('code', size_item.code, 'name', size_item.name)
        order by size_item.display_order, size_item.name)
      from public.product_sizes ps join public.sizes size_item on size_item.id = ps.size_id
      where ps.product_id = p.id and size_item.is_active = true
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'size_code', size_item.code, 'size_name', size_item.name, 'weight_grams', fulfillment.weight_grams
      ) order by size_item.display_order, size_item.name)
      from public.product_size_fulfillment fulfillment
      join public.sizes size_item on size_item.id = fulfillment.size_id
      where fulfillment.product_id = p.id
    ), '[]'::jsonb),
    'size_chart_url', charts.size_chart_url, 'color_chart_url', charts.color_chart_url
  )
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.product_charts charts on charts.product_id = p.id
  where lower(p.slug) = lower(trim(p_slug)) and p.publication_status = 'PUBLISHED'
  limit 1;
$$;

revoke all on function public.admin_product_fulfillment(uuid) from public, anon;
revoke all on function public.save_product_fulfillment(uuid, jsonb) from public, anon;
revoke all on function public.authorized_product_fulfillment(text) from public, anon;
revoke all on function public.public_product_weights(text) from public;
grant execute on function public.admin_product_fulfillment(uuid) to authenticated;
grant execute on function public.save_product_fulfillment(uuid, jsonb) to authenticated;
grant execute on function public.authorized_product_fulfillment(text) to authenticated;
grant execute on function public.public_product_weights(text) to anon, authenticated;
grant execute on function public.public_product_detail(text) to anon, authenticated;
notify pgrst, 'reload schema';
