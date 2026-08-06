alter table public.product_size_fulfillment
  add column if not exists base_cost numeric(12,2),
  add column if not exists shipping_estimates jsonb not null default '{}'::jsonb;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='product_size_fulfillment' and column_name='shipping_price') then
    execute 'update public.product_size_fulfillment
      set shipping_estimates=jsonb_build_object(''rest_of_world'',shipping_price)
      where shipping_price is not null and shipping_estimates=''{}''::jsonb';
  end if;
end; $$;

drop function if exists public.admin_product_fulfillment(uuid);
create or replace function public.admin_product_fulfillment(p_product_id uuid)
returns table(size_id uuid,size_code text,size_name text,display_order integer,
  weight_grams numeric,base_cost numeric,shipping_estimates jsonb,currency text)
language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  return query select s.id,s.code,s.name,s.display_order,f.weight_grams,f.base_cost,
    coalesce(f.shipping_estimates,'{}'::jsonb),coalesce(f.currency,'USD')
  from public.product_sizes ps join public.sizes s on s.id=ps.size_id
  left join public.product_size_fulfillment f on f.product_id=ps.product_id and f.size_id=ps.size_id
  where ps.product_id=p_product_id order by s.display_order,s.name;
end; $$;

create or replace function public.authorized_product_fulfillment(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_active boolean; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select active into v_active from public.profiles where id=auth.uid();
  if coalesce(v_active,false) is not true then raise exception 'Active account required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'size_code',s.code,'size_name',s.name,'weight_grams',f.weight_grams,
    'base_cost',f.base_cost,'shipping_estimates',coalesce(f.shipping_estimates,'{}'::jsonb),
    'currency',f.currency) order by s.display_order,s.name),'[]'::jsonb)
  into v_result from public.products p
  join public.product_size_fulfillment f on f.product_id=p.id
  join public.sizes s on s.id=f.size_id
  where lower(p.slug)=lower(trim(p_slug)) and p.publication_status='PUBLISHED';
  return coalesce(v_result,'[]'::jsonb);
end; $$;

revoke all on function public.admin_product_fulfillment(uuid) from public,anon;
revoke all on function public.authorized_product_fulfillment(text) from public,anon;
grant execute on function public.admin_product_fulfillment(uuid) to authenticated;
grant execute on function public.authorized_product_fulfillment(text) to authenticated;
notify pgrst,'reload schema';
