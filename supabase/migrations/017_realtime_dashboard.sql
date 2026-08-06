create or replace function public.dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with product_flags as (
    select
      p.id,
      p.publication_status,
      p.created_at,
      exists(select 1 from public.product_images pi where pi.product_id=p.id and pi.is_thumbnail=true) as has_image,
      exists(select 1 from public.product_colors pc where pc.product_id=p.id) as has_color,
      exists(select 1 from public.product_sizes ps where ps.product_id=p.id) as has_size,
      (
        charts.size_chart_url is not null and trim(charts.size_chart_url)<>''
        and charts.color_chart_url is not null and trim(charts.color_chart_url)<>''
      ) as has_charts
    from public.products p
    left join public.product_charts charts on charts.product_id=p.id
    where p.publication_status<>'ARCHIVED'
  ),
  totals as (
    select
      count(*) as total_products,
      count(*) filter(where created_at>=date_trunc('month',now())) as products_this_month,
      count(*) filter(where publication_status='PUBLISHED') as published_products,
      count(*) filter(where publication_status='DRAFT') as draft_products,
      count(*) filter(where publication_status='UNPUBLISHED') as unpublished_products,
      count(*) filter(where not has_image) as missing_images,
      count(*) filter(where not has_color or not has_size) as missing_options,
      count(*) filter(where not has_charts) as missing_charts,
      count(*) filter(where publication_status='DRAFT' and has_image and has_color and has_size) as ready_drafts,
      count(*) filter(where publication_status='DRAFT' and not (has_image and has_color and has_size)) as blocked_drafts,
      count(*) filter(where publication_status='PUBLISHED' and not has_charts) as warning_products
    from product_flags
  )
  select jsonb_build_object(
    'total_products',total_products,
    'products_this_month',products_this_month,
    'published_products',published_products,
    'draft_products',draft_products,
    'unpublished_products',unpublished_products,
    'published_percent',case when total_products=0 then 0 else round(published_products*100.0/total_products) end,
    'missing_images',missing_images,
    'missing_options',missing_options,
    'missing_charts',missing_charts,
    'ready_drafts',ready_drafts,
    'blocked_drafts',blocked_drafts,
    'warning_products',warning_products
  ) from totals
  where public.is_active_user();
$$;

revoke all on function public.dashboard_stats() from public,anon;
grant execute on function public.dashboard_stats() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['products','product_images','product_charts','product_colors','product_sizes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
