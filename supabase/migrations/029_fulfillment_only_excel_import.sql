create or replace function public.import_product_fulfillment_prices(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_size_id uuid;
  v_updated integer:=0;
  v_actor_email text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(coalesce(p_rows,'null'::jsonb))<>'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'Fulfillment rows are required';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    select p.id into v_product_id
    from public.products p
    where lower(trim(p.product_code))=lower(trim(v_item->>'product_code'));
    if v_product_id is null then
      raise exception 'Product Code % does not exist',coalesce(v_item->>'product_code','(blank)');
    end if;

    select s.id into v_size_id
    from public.product_sizes ps
    join public.sizes s on s.id=ps.size_id
    where ps.product_id=v_product_id
      and (lower(trim(s.code))=lower(trim(v_item->>'size'))
        or lower(trim(s.name))=lower(trim(v_item->>'size')))
    limit 1;
    if v_size_id is null then
      raise exception 'Size % is not assigned to product %',coalesce(v_item->>'size','(blank)'),v_item->>'product_code';
    end if;

    insert into public.product_size_fulfillment(
      product_id,size_id,weight_grams,base_cost,shipping_estimates,currency,updated_by,updated_at)
    values(
      v_product_id,v_size_id,
      nullif(v_item->>'weight_grams','')::numeric,
      nullif(v_item->>'base_cost','')::numeric,
      coalesce(v_item->'shipping_estimates','{}'::jsonb),
      'USD',auth.uid(),now())
    on conflict(product_id,size_id) do update set
      weight_grams=coalesce(excluded.weight_grams,product_size_fulfillment.weight_grams),
      base_cost=coalesce(excluded.base_cost,product_size_fulfillment.base_cost),
      shipping_estimates=coalesce(product_size_fulfillment.shipping_estimates,'{}'::jsonb)
        || coalesce(excluded.shipping_estimates,'{}'::jsonb),
      currency='USD',updated_by=auth.uid(),updated_at=now();
    v_updated:=v_updated+1;
  end loop;

  select email into v_actor_email from auth.users where id=auth.uid();
  insert into public.activity_logs(actor_user_id,actor_email,action,entity_type,after_data,metadata)
  values(auth.uid(),v_actor_email,'IMPORT_FULFILLMENT','product_fulfillment',
    jsonb_build_object('updated_rows',v_updated),jsonb_build_object('source','excel_fulfillment_only'));
  return jsonb_build_object('updated_rows',v_updated);
end;
$$;

revoke all on function public.import_product_fulfillment_prices(jsonb) from public,anon;
grant execute on function public.import_product_fulfillment_prices(jsonb) to authenticated;
notify pgrst,'reload schema';
