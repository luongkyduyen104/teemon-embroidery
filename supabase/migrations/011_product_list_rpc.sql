create or replace function public.list_products(
  p_search text default null,
  p_category_id uuid default null,
  p_status text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id uuid,
  product_code text,
  product_name text,
  slug text,
  publication_status text,
  category_id uuid,
  category_name text,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_active_user() then
    raise exception 'Active account required';
  end if;

  return query
  select
    p.id,
    p.product_code,
    p.product_name,
    p.slug,
    p.publication_status::text,
    p.category_id,
    c.name,
    p.updated_at,
    p.updated_by,
    coalesce(nullif(trim(pr.full_name), ''), pr.email),
    count(*) over()
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.profiles pr on pr.id = p.updated_by
  where (
    nullif(trim(p_search), '') is null
    or p.product_name ilike '%' || trim(p_search) || '%'
    or p.product_code ilike '%' || trim(p_search) || '%'
  )
  and (p_category_id is null or p.category_id = p_category_id)
  and (nullif(trim(p_status), '') is null or p.publication_status::text = upper(trim(p_status)))
  order by p.updated_at desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

revoke all on function public.list_products(text, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_products(text, uuid, text, integer, integer)
  to authenticated;

