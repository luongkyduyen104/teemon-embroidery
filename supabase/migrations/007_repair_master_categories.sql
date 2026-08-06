-- Repair the fixed v1 categories and make master-data reads independent from
-- profile-table RLS. Product mutations remain protected by admin-only RPCs.

insert into public.categories (code, name, slug, is_active)
select 'CLOTHING', 'Clothing', 'clothing', true
where not exists (
  select 1 from public.categories where lower(code) = 'clothing'
);

insert into public.categories (code, name, slug, is_active)
select 'HOME-LIVING', 'Home & Living', 'home-living', true
where not exists (
  select 1 from public.categories where lower(code) = 'home-living'
);

insert into public.categories (code, name, slug, is_active)
select 'ACCESSORIES', 'Accessories', 'accessories', true
where not exists (
  select 1 from public.categories where lower(code) = 'accessories'
);

update public.categories
set
  is_active = true,
  updated_at = now()
where lower(code) in ('clothing', 'home-living', 'accessories');

drop policy if exists "Active users can read categories" on public.categories;
create policy "Authenticated users can read categories"
on public.categories
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Active users can read colors" on public.colors;
create policy "Authenticated users can read colors"
on public.colors
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Active users can read sizes" on public.sizes;
create policy "Authenticated users can read sizes"
on public.sizes
for select
to authenticated
using (auth.uid() is not null);

