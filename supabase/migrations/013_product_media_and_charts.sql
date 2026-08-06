insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-assets',
  'product-assets',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  alt_text text,
  is_thumbnail boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_charts (
  product_id uuid primary key references public.products(id) on delete cascade,
  size_chart_url text,
  color_chart_url text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_product_thumbnail_idx
on public.product_images(product_id) where is_thumbnail = true;

alter table public.product_images enable row level security;
alter table public.product_charts enable row level security;
grant select on public.product_images, public.product_charts to authenticated;

drop policy if exists "Active users read product images" on public.product_images;
create policy "Active users read product images" on public.product_images
for select to authenticated using (exists (
  select 1 from public.profiles where id = auth.uid() and active = true
));
drop policy if exists "Active users read product charts" on public.product_charts;
create policy "Active users read product charts" on public.product_charts
for select to authenticated using (exists (
  select 1 from public.profiles where id = auth.uid() and active = true
));

drop policy if exists "Admins upload product assets" on storage.objects;
create policy "Admins upload product assets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-assets' and public.is_admin()
);
drop policy if exists "Admins delete product assets" on storage.objects;
create policy "Admins delete product assets" on storage.objects
for delete to authenticated using (
  bucket_id = 'product-assets' and public.is_admin()
);

create or replace function public.add_product_image(
  p_product_id uuid,
  p_storage_path text,
  p_image_url text,
  p_alt_text text
)
returns public.product_images
language plpgsql security definer set search_path = public, auth
as $$
declare v_image public.product_images; v_count integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select count(*) into v_count from public.product_images where product_id = p_product_id;
  if v_count >= 3 then raise exception 'A product can contain at most 3 images'; end if;
  insert into public.product_images (
    product_id, storage_path, image_url, alt_text, is_thumbnail, display_order
  ) values (
    p_product_id, p_storage_path, p_image_url, nullif(trim(p_alt_text),''),
    v_count = 0, v_count
  ) returning * into v_image;
  return v_image;
end $$;

create or replace function public.delete_product_image(p_image_id uuid)
returns text
language plpgsql security definer set search_path = public, auth
as $$
declare v_image public.product_images; v_next uuid;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  delete from public.product_images where id = p_image_id returning * into v_image;
  if not found then raise exception 'Image not found'; end if;
  if v_image.is_thumbnail then
    select id into v_next from public.product_images
    where product_id = v_image.product_id order by display_order, created_at limit 1;
    update public.product_images set is_thumbnail = true where id = v_next;
  end if;
  return v_image.storage_path;
end $$;

create or replace function public.set_product_chart_urls(
  p_product_id uuid,
  p_size_chart_url text,
  p_color_chart_url text
)
returns public.product_charts
language plpgsql security definer set search_path = public, auth
as $$
declare v_chart public.product_charts;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  insert into public.product_charts(product_id,size_chart_url,color_chart_url,updated_by)
  values (
    p_product_id, nullif(trim(p_size_chart_url),''), nullif(trim(p_color_chart_url),''),
    auth.uid()
  )
  on conflict(product_id) do update set
    size_chart_url=excluded.size_chart_url,
    color_chart_url=excluded.color_chart_url,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_chart;
  return v_chart;
end $$;

revoke all on function public.add_product_image(uuid,text,text,text) from public,anon;
revoke all on function public.delete_product_image(uuid) from public,anon;
revoke all on function public.set_product_chart_urls(uuid,text,text) from public,anon;
grant execute on function public.add_product_image(uuid,text,text,text) to authenticated;
grant execute on function public.delete_product_image(uuid) to authenticated;
grant execute on function public.set_product_chart_urls(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
