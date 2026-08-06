create or replace function public.add_product_image(
  p_product_id uuid,
  p_storage_path text,
  p_image_url text,
  p_alt_text text
)
returns public.product_images
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_image public.product_images;
  v_count integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if not exists(select 1 from public.products where id=p_product_id) then
    raise exception 'Product not found';
  end if;
  select count(*) into v_count
  from public.product_images
  where product_id=p_product_id;
  if v_count>=7 then raise exception 'A product can contain at most 7 images'; end if;

  insert into public.product_images(
    product_id,storage_path,image_url,alt_text,is_thumbnail,display_order
  ) values(
    p_product_id,p_storage_path,p_image_url,nullif(trim(p_alt_text),''),
    v_count=0,v_count
  ) returning * into v_image;
  return v_image;
end;
$$;

revoke all on function public.add_product_image(uuid,text,text,text) from public,anon;
grant execute on function public.add_product_image(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
