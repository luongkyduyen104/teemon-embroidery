create or replace function public.bulk_publish_products(p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.products;
  v_actor_email text;
  v_changed integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(cardinality(p_product_ids), 0) = 0 then return 0; end if;
  select email into v_actor_email from auth.users where id = auth.uid();

  for v_product in
    select * from public.products
    where id = any(p_product_ids) and publication_status in ('DRAFT', 'UNPUBLISHED')
    for update
  loop
    if not exists (
      select 1 from public.product_images
      where product_id = v_product.id and is_thumbnail = true
    ) then raise exception '%: upload at least one product image before publishing', v_product.product_name; end if;
    if not exists (
      select 1 from public.product_colors where product_id = v_product.id
    ) then raise exception '%: select at least one color before publishing', v_product.product_name; end if;
    if not exists (
      select 1 from public.product_sizes where product_id = v_product.id
    ) then raise exception '%: select at least one size before publishing', v_product.product_name; end if;

    update public.products set
      publication_status = 'PUBLISHED',
      published_at = coalesce(published_at, now()),
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_product.id;

    insert into public.activity_logs(
      actor_user_id, actor_email, action, entity_type, entity_id,
      before_data, after_data, metadata
    ) values (
      auth.uid(), v_actor_email, 'PUBLISH_PRODUCT', 'product', v_product.id::text,
      jsonb_build_object('publication_status', v_product.publication_status, 'version', v_product.version),
      jsonb_build_object('publication_status', 'PUBLISHED', 'version', v_product.version + 1),
      jsonb_build_object('source', 'products_bulk_action')
    );
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end;
$$;

revoke all on function public.bulk_publish_products(uuid[]) from public, anon;
grant execute on function public.bulk_publish_products(uuid[]) to authenticated;
notify pgrst, 'reload schema';
