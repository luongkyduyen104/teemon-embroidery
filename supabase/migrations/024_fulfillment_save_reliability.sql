create or replace function public.save_product_fulfillment_v2(p_product_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_actor_email text; v_saved integer; v_rows jsonb:=coalesce(p_rows,'[]'::jsonb);
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if not exists(select 1 from public.products where id=p_product_id) then raise exception 'Product not found'; end if;
  if jsonb_typeof(v_rows)<>'array' then raise exception 'Fulfillment rows must be an array'; end if;

  if exists(select 1 from jsonb_array_elements(v_rows) item
    where nullif(item->>'size_id','') is null
      or not exists(select 1 from public.product_sizes ps
        where ps.product_id=p_product_id and ps.size_id=(item->>'size_id')::uuid))
  then raise exception 'Fulfillment contains a size that is not selected for this product'; end if;

  insert into public.product_size_fulfillment(
    product_id,size_id,weight_grams,base_cost,shipping_estimates,currency,updated_by,updated_at)
  select p_product_id,(item->>'size_id')::uuid,
    nullif(item->>'weight_grams','')::numeric,
    nullif(item->>'base_cost','')::numeric,
    coalesce(item->'shipping_estimates','{}'::jsonb),
    upper(coalesce(nullif(trim(item->>'currency'),''),'USD')),auth.uid(),now()
  from jsonb_array_elements(v_rows) item
  on conflict(product_id,size_id) do update set
    weight_grams=excluded.weight_grams,base_cost=excluded.base_cost,
    shipping_estimates=excluded.shipping_estimates,currency=excluded.currency,
    updated_by=excluded.updated_by,updated_at=now();

  delete from public.product_size_fulfillment f where f.product_id=p_product_id
    and not exists(select 1 from jsonb_array_elements(v_rows) item
      where (item->>'size_id')::uuid=f.size_id);

  select count(*) into v_saved from public.product_size_fulfillment where product_id=p_product_id;
  select email into v_actor_email from auth.users where id=auth.uid();
  insert into public.activity_logs(actor_user_id,actor_email,action,entity_type,entity_id,after_data,metadata)
  values(auth.uid(),v_actor_email,'UPDATE_FULFILLMENT','product',p_product_id::text,
    jsonb_build_object('rows',v_rows,'saved_rows',v_saved),jsonb_build_object('source','product_edit_page_v2'));
  return jsonb_build_object('saved_rows',v_saved);
end; $$;

revoke all on function public.save_product_fulfillment_v2(uuid,jsonb) from public,anon;
grant execute on function public.save_product_fulfillment_v2(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
