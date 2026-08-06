create or replace function public.set_product_publication_status(
  p_product_id uuid,
  p_expected_version integer,
  p_new_status text
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.products;
  v_after public.products;
  v_status public.publication_status;
  v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if upper(trim(p_new_status)) not in ('PUBLISHED','UNPUBLISHED') then
    raise exception 'Status must be PUBLISHED or UNPUBLISHED';
  end if;
  v_status := upper(trim(p_new_status))::public.publication_status;
  select * into v_before from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_before.version <> p_expected_version then
    raise exception 'Product version conflict. Reload before changing status.';
  end if;
  if v_before.publication_status = 'ARCHIVED' then
    raise exception 'Archived products cannot be published';
  end if;
  if v_status = 'PUBLISHED' then
    if not exists (
      select 1 from public.product_images where product_id = p_product_id and is_thumbnail = true
    ) then raise exception 'Upload at least one product image before publishing'; end if;
    if not exists (
      select 1 from public.product_colors where product_id = p_product_id
    ) then raise exception 'Select at least one color before publishing'; end if;
    if not exists (
      select 1 from public.product_sizes where product_id = p_product_id
    ) then raise exception 'Select at least one size before publishing'; end if;
  end if;
  update public.products set
    publication_status = v_status,
    published_at = case when v_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_product_id returning * into v_after;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.activity_logs(
    actor_user_id,actor_email,action,entity_type,entity_id,before_data,after_data,metadata
  ) values (
    auth.uid(),v_actor_email,
    case when v_status='PUBLISHED' then 'PUBLISH_PRODUCT' else 'UNPUBLISH_PRODUCT' end,
    'product',v_after.id::text,
    jsonb_build_object('publication_status',v_before.publication_status,'version',v_before.version),
    jsonb_build_object('publication_status',v_after.publication_status,'version',v_after.version),
    jsonb_build_object('source','product_edit_page')
  );
  return v_after;
end $$;

create or replace function public.public_catalog_products()
returns table(
  id uuid,
  product_code text,
  product_name text,
  slug text,
  short_description text,
  category_name text,
  thumbnail_url text,
  color_count bigint,
  size_count bigint,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,p.product_code,p.product_name,p.slug,p.short_description,c.name,
    (select pi.image_url from public.product_images pi
      where pi.product_id=p.id and pi.is_thumbnail=true limit 1),
    (select count(*) from public.product_colors pc where pc.product_id=p.id),
    (select count(*) from public.product_sizes ps where ps.product_id=p.id),
    p.published_at
  from public.products p
  join public.categories c on c.id=p.category_id
  where p.publication_status='PUBLISHED'
  order by p.published_at desc nulls last, p.updated_at desc;
$$;

revoke all on function public.set_product_publication_status(uuid,integer,text) from public,anon;
grant execute on function public.set_product_publication_status(uuid,integer,text) to authenticated;
revoke all on function public.public_catalog_products() from public;
grant execute on function public.public_catalog_products() to anon,authenticated;
notify pgrst, 'reload schema';
