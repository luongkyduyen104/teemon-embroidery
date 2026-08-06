alter table public.products add column if not exists keywords text[] not null default '{}'::text[];
create index if not exists products_keywords_gin_idx on public.products using gin(keywords);

create or replace function public.normalize_product_keywords(p_keywords text[])
returns text[] language sql immutable set search_path=public as $$
  select coalesce(array_agg(keyword order by keyword), '{}'::text[])
  from (select distinct lower(trim(value)) keyword
    from unnest(coalesce(p_keywords,'{}'::text[])) item(value)
    where nullif(trim(value),'') is not null and char_length(trim(value))<=60 limit 30) normalized;
$$;

create or replace function public.create_draft_product_with_keywords(
  p_product_code text,p_product_name text,p_slug text,p_category_code text,
  p_short_description text,p_description text,p_keywords text[],p_color_ids uuid[],p_size_ids uuid[])
returns public.products language plpgsql security definer set search_path=public,auth as $$
declare v_product public.products;
begin
  v_product:=public.create_draft_product_with_options(p_product_code,p_product_name,p_slug,
    p_category_code,p_short_description,p_description,p_color_ids,p_size_ids);
  update public.products set keywords=public.normalize_product_keywords(p_keywords)
    where id=v_product.id returning * into v_product;
  return v_product;
end; $$;

create or replace function public.update_product_with_keywords(
  p_product_id uuid,p_expected_version integer,p_product_code text,p_product_name text,
  p_slug text,p_category_code text,p_short_description text,p_description text,
  p_keywords text[],p_color_ids uuid[],p_size_ids uuid[])
returns public.products language plpgsql security definer set search_path=public,auth as $$
declare v_product public.products;
begin
  v_product:=public.update_product_with_options(p_product_id,p_expected_version,p_product_code,
    p_product_name,p_slug,p_category_code,p_short_description,p_description,p_color_ids,p_size_ids);
  update public.products set keywords=public.normalize_product_keywords(p_keywords)
    where id=v_product.id returning * into v_product;
  return v_product;
end; $$;

revoke all on function public.create_draft_product_with_keywords(text,text,text,text,text,text,text[],uuid[],uuid[]) from public,anon;
revoke all on function public.update_product_with_keywords(uuid,integer,text,text,text,text,text,text,text[],uuid[],uuid[]) from public,anon;
grant execute on function public.create_draft_product_with_keywords(text,text,text,text,text,text,text[],uuid[],uuid[]) to authenticated;
grant execute on function public.update_product_with_keywords(uuid,integer,text,text,text,text,text,text,text[],uuid[],uuid[]) to authenticated;

create or replace function public.public_catalog_products_searchable()
returns table(id uuid,product_code text,product_name text,slug text,short_description text,
  category_name text,thumbnail_url text,color_count bigint,size_count bigint,published_at timestamptz,keywords text[])
language sql stable security definer set search_path=public as $$
  select p.id,p.product_code,p.product_name,p.slug,p.short_description,c.name,
    (select pi.image_url from public.product_images pi where pi.product_id=p.id and pi.is_thumbnail=true limit 1),
    (select count(*) from public.product_colors pc where pc.product_id=p.id),
    (select count(*) from public.product_sizes ps where ps.product_id=p.id),p.published_at,p.keywords
  from public.products p join public.categories c on c.id=p.category_id
  where p.publication_status='PUBLISHED'
  order by p.published_at desc nulls last,p.updated_at desc;
$$;
revoke all on function public.public_catalog_products_searchable() from public;
grant execute on function public.public_catalog_products_searchable() to anon,authenticated;
notify pgrst,'reload schema';
