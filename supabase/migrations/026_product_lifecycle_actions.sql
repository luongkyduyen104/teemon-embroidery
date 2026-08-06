create or replace function public.bulk_deactivate_products(p_product_ids uuid[])
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
    where id = any(p_product_ids)
      and publication_status not in ('UNPUBLISHED', 'ARCHIVED')
    for update
  loop
    update public.products set
      publication_status = 'UNPUBLISHED',
      is_featured = false,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_product.id;

    insert into public.activity_logs(
      actor_user_id, actor_email, action, entity_type, entity_id,
      before_data, after_data, metadata
    ) values (
      auth.uid(), v_actor_email, 'UNPUBLISH_PRODUCT', 'product', v_product.id::text,
      jsonb_build_object('product_name',v_product.product_name,'publication_status',v_product.publication_status,'version',v_product.version),
      jsonb_build_object('product_name',v_product.product_name,'publication_status','UNPUBLISHED','version',v_product.version + 1),
      jsonb_build_object('source','products_bulk_action')
    );
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end;
$$;

create or replace function public.bulk_delete_products(p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.products;
  v_actor_email text;
  v_deleted integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(cardinality(p_product_ids), 0) = 0 then return 0; end if;
  select email into v_actor_email from auth.users where id = auth.uid();

  for v_product in
    select * from public.products where id = any(p_product_ids) for update
  loop
    delete from public.products where id = v_product.id;

    insert into public.activity_logs(
      actor_user_id, actor_email, action, entity_type, entity_id,
      before_data, after_data, metadata
    ) values (
      auth.uid(), v_actor_email, 'DELETE_PRODUCT', 'product', v_product.id::text,
      jsonb_build_object(
        'product_code', v_product.product_code,
        'product_name', v_product.product_name,
        'publication_status', v_product.publication_status
      ),
      '{}'::jsonb,
      jsonb_build_object('source','products_bulk_action','permanent',true)
    );
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function public.bulk_deactivate_products(uuid[]) from public, anon;
revoke all on function public.bulk_delete_products(uuid[]) from public, anon;
grant execute on function public.bulk_deactivate_products(uuid[]) to authenticated;
grant execute on function public.bulk_delete_products(uuid[]) to authenticated;
notify pgrst, 'reload schema';
