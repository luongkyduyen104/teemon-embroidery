alter table public.products
  add column if not exists is_featured boolean not null default false;

create index if not exists products_featured_published_idx
  on public.products(is_featured, published_at desc)
  where publication_status = 'PUBLISHED';

create or replace function public.clear_featured_when_unpublished()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.publication_status <> 'PUBLISHED' then new.is_featured := false; end if;
  return new;
end;
$$;
drop trigger if exists products_clear_featured_when_unpublished on public.products;
create trigger products_clear_featured_when_unpublished
before insert or update of publication_status on public.products
for each row execute function public.clear_featured_when_unpublished();

drop function if exists public.list_products(text, uuid, text, integer, integer);
create function public.list_products(
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
  is_featured boolean,
  total_count bigint
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  return query
  select p.id,p.product_code,p.product_name,p.slug,p.publication_status::text,
    p.category_id,c.name,p.updated_at,p.updated_by,
    coalesce(nullif(trim(pr.full_name), ''), pr.email),p.is_featured,count(*) over()
  from public.products p
  join public.categories c on c.id=p.category_id
  left join public.profiles pr on pr.id=p.updated_by
  where (nullif(trim(p_search), '') is null
    or p.product_name ilike '%' || trim(p_search) || '%'
    or p.product_code ilike '%' || trim(p_search) || '%')
    and (p_category_id is null or p.category_id=p_category_id)
    and (nullif(trim(p_status), '') is null or p.publication_status::text=upper(trim(p_status)))
  order by p.updated_at desc
  offset greatest(coalesce(p_offset,0),0)
  limit least(greatest(coalesce(p_limit,25),1),100);
end;
$$;

revoke all on function public.list_products(text,uuid,text,integer,integer) from public,anon;
grant execute on function public.list_products(text,uuid,text,integer,integer) to authenticated;

create or replace function public.toggle_featured_product(p_product_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth
as $$
declare v_product public.products; v_featured_count integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  lock table public.products in share row exclusive mode;
  select * into v_product from public.products where id=p_product_id;
  if v_product.id is null then raise exception 'Product not found'; end if;
  if v_product.is_featured then
    update public.products set is_featured=false,updated_at=now(),updated_by=auth.uid() where id=p_product_id;
    return false;
  end if;
  if v_product.publication_status <> 'PUBLISHED' then
    raise exception 'Only published products can be featured';
  end if;
  select count(*) into v_featured_count from public.products
    where is_featured=true and publication_status='PUBLISHED';
  if v_featured_count >= 3 then raise exception 'A maximum of 3 products can be featured'; end if;
  update public.products set is_featured=true,updated_at=now(),updated_by=auth.uid() where id=p_product_id;
  return true;
end;
$$;

revoke all on function public.toggle_featured_product(uuid) from public,anon;
grant execute on function public.toggle_featured_product(uuid) to authenticated;

create or replace function public.public_featured_products()
returns table(
  id uuid, product_code text, product_name text, slug text, short_description text,
  category_name text, thumbnail_url text, color_count bigint, size_count bigint,
  published_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  select p.id,p.product_code,p.product_name,p.slug,p.short_description,c.name,
    (select pi.image_url from public.product_images pi where pi.product_id=p.id
      order by pi.is_thumbnail desc,pi.display_order,pi.created_at limit 1),
    (select count(*) from public.product_colors pc where pc.product_id=p.id),
    (select count(*) from public.product_sizes ps where ps.product_id=p.id),p.published_at
  from public.products p join public.categories c on c.id=p.category_id
  where p.publication_status='PUBLISHED' and p.is_featured=true
  order by p.published_at desc nulls last,p.updated_at desc
  limit 3;
$$;

revoke all on function public.public_featured_products() from public;
grant execute on function public.public_featured_products() to anon,authenticated;
notify pgrst, 'reload schema';
