-- Publish weight by size with product detail; never expose cost or shipping here.
create or replace function public.public_product_detail(p_slug text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'product_code', p.product_code, 'product_name', p.product_name,
    'slug', p.slug, 'short_description', p.short_description, 'description', p.description,
    'category_name', c.name,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'url', pi.image_url, 'alt_text', pi.alt_text, 'is_thumbnail', pi.is_thumbnail
      ) order by pi.is_thumbnail desc, pi.display_order, pi.created_at)
      from public.product_images pi where pi.product_id = p.id
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', color.code, 'name', color.name, 'hex_code', color.hex_code
      ) order by color.name)
      from public.product_colors pc
      join public.colors color on color.id = pc.color_id
      where pc.product_id = p.id and color.is_active = true
    ), '[]'::jsonb),
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object('code', size_item.code, 'name', size_item.name)
        order by size_item.display_order, size_item.name)
      from public.product_sizes ps
      join public.sizes size_item on size_item.id = ps.size_id
      where ps.product_id = p.id and size_item.is_active = true
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'size_code', size_item.code, 'size_name', size_item.name,
        'weight_grams', fulfillment.weight_grams
      ) order by size_item.display_order, size_item.name)
      from public.product_size_fulfillment fulfillment
      join public.sizes size_item on size_item.id = fulfillment.size_id
      where fulfillment.product_id = p.id
    ), '[]'::jsonb),
    'size_chart_url', charts.size_chart_url, 'color_chart_url', charts.color_chart_url
  )
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.product_charts charts on charts.product_id = p.id
  where lower(p.slug) = lower(trim(p_slug)) and p.publication_status = 'PUBLISHED'
  limit 1;
$$;

revoke all on function public.public_product_detail(text) from public;
grant execute on function public.public_product_detail(text) to anon, authenticated;
notify pgrst, 'reload schema';
