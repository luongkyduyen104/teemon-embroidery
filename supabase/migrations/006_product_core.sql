create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'publication_status') then
    create type public.publication_status as enum (
      'DRAFT',
      'PUBLISHED',
      'UNPUBLISHED',
      'ARCHIVED'
    );
  end if;
end
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_code_ci_idx
  on public.categories (lower(code));
create unique index if not exists categories_slug_ci_idx
  on public.categories (lower(slug));

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  hex_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colors_hex_code_check
    check (hex_code is null or hex_code ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists colors_code_ci_idx
  on public.colors (lower(code));

create table if not exists public.sizes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sizes_code_ci_idx
  on public.sizes (lower(code));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null,
  product_name text not null,
  slug text not null,
  category_id uuid not null references public.categories(id),
  short_description text,
  description text not null,
  publication_status public.publication_status not null default 'DRAFT',
  version integer not null default 1,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_length_check
    check (char_length(trim(product_name)) between 2 and 255),
  constraint products_short_description_length_check
    check (short_description is null or char_length(short_description) <= 500),
  constraint products_description_check
    check (char_length(trim(description)) > 0),
  constraint products_version_check check (version > 0)
);

create unique index if not exists products_code_ci_idx
  on public.products (lower(product_code));
create unique index if not exists products_slug_ci_idx
  on public.products (lower(slug));
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_status_idx on public.products(publication_status);
create index if not exists products_updated_at_idx on public.products(updated_at desc);

insert into public.categories (code, name, slug)
values
  ('CLOTHING', 'Clothing', 'clothing'),
  ('HOME-LIVING', 'Home & Living', 'home-living'),
  ('ACCESSORIES', 'Accessories', 'accessories')
on conflict do nothing;

alter table public.categories enable row level security;
alter table public.colors enable row level security;
alter table public.sizes enable row level security;
alter table public.products enable row level security;

revoke all on public.categories, public.colors, public.sizes, public.products
  from anon, authenticated;
grant select on public.categories, public.colors, public.sizes, public.products
  to authenticated;

drop policy if exists "Active users can read categories" on public.categories;
create policy "Active users can read categories"
on public.categories for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

drop policy if exists "Active users can read colors" on public.colors;
create policy "Active users can read colors"
on public.colors for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

drop policy if exists "Active users can read sizes" on public.sizes;
create policy "Active users can read sizes"
on public.sizes for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

drop policy if exists "Active users can read products" on public.products;
create policy "Active users can read products"
on public.products for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.active = true
));

create or replace function public.create_draft_product(
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_id uuid,
  p_short_description text,
  p_description text
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.products;
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if nullif(trim(p_product_code), '') is null then
    raise exception 'Product code is required';
  end if;
  if char_length(trim(p_product_name)) < 2 then
    raise exception 'Product name must contain at least 2 characters';
  end if;
  if nullif(trim(p_slug), '') is null
     or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must contain lowercase letters, numbers and hyphens only';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception 'Description is required';
  end if;
  if not exists (
    select 1 from public.categories
    where id = p_category_id and is_active = true
  ) then
    raise exception 'Active category is required';
  end if;

  insert into public.products (
    product_code,
    product_name,
    slug,
    category_id,
    short_description,
    description,
    created_by,
    updated_by
  )
  values (
    trim(p_product_code),
    trim(p_product_name),
    trim(p_slug),
    p_category_id,
    nullif(trim(p_short_description), ''),
    trim(p_description),
    auth.uid(),
    auth.uid()
  )
  returning * into v_product;

  select email into v_actor_email
  from auth.users where id = auth.uid();

  insert into public.activity_logs (
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  )
  values (
    auth.uid(),
    v_actor_email,
    'CREATE_PRODUCT',
    'product',
    v_product.id::text,
    jsonb_build_object(
      'product_code', v_product.product_code,
      'product_name', v_product.product_name,
      'slug', v_product.slug,
      'category_id', v_product.category_id,
      'publication_status', v_product.publication_status
    ),
    jsonb_build_object('source', 'product_create_page')
  );

  return v_product;
exception
  when unique_violation then
    raise exception 'Product code or slug already exists';
end;
$$;

revoke all on function public.create_draft_product(
  text, text, text, uuid, text, text
) from public, anon;
grant execute on function public.create_draft_product(
  text, text, text, uuid, text, text
) to authenticated;

create or replace function public.update_product_basic(
  p_product_id uuid,
  p_expected_version integer,
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_id uuid,
  p_short_description text,
  p_description text
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.products;
  v_after public.products;
  v_actor_email text;
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  select * into v_before
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;
  if v_before.publication_status = 'ARCHIVED' then
    raise exception 'Archived products are read-only until restored';
  end if;
  if v_before.version <> p_expected_version then
    raise exception 'Product version conflict. Reload before saving.';
  end if;
  if nullif(trim(p_product_code), '') is null
     or char_length(trim(p_product_name)) < 2
     or nullif(trim(p_description), '') is null then
    raise exception 'Product code, name and description are required';
  end if;
  if nullif(trim(p_slug), '') is null
     or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug must contain lowercase letters, numbers and hyphens only';
  end if;
  if not exists (
    select 1 from public.categories
    where id = p_category_id and is_active = true
  ) then
    raise exception 'Active category is required';
  end if;

  update public.products
  set
    product_code = trim(p_product_code),
    product_name = trim(p_product_name),
    slug = trim(p_slug),
    category_id = p_category_id,
    short_description = nullif(trim(p_short_description), ''),
    description = trim(p_description),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_product_id
  returning * into v_after;

  select email into v_actor_email
  from auth.users where id = auth.uid();

  insert into public.activity_logs (
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    auth.uid(),
    v_actor_email,
    'UPDATE_PRODUCT',
    'product',
    v_after.id::text,
    jsonb_build_object(
      'product_code', v_before.product_code,
      'product_name', v_before.product_name,
      'slug', v_before.slug,
      'category_id', v_before.category_id,
      'short_description', v_before.short_description,
      'description', v_before.description,
      'version', v_before.version
    ),
    jsonb_build_object(
      'product_code', v_after.product_code,
      'product_name', v_after.product_name,
      'slug', v_after.slug,
      'category_id', v_after.category_id,
      'short_description', v_after.short_description,
      'description', v_after.description,
      'version', v_after.version
    ),
    jsonb_build_object('source', 'product_edit_page')
  );

  return v_after;
exception
  when unique_violation then
    raise exception 'Product code or slug already exists';
end;
$$;

revoke all on function public.update_product_basic(
  uuid, integer, text, text, text, uuid, text, text
) from public, anon;
grant execute on function public.update_product_basic(
  uuid, integer, text, text, text, uuid, text, text
) to authenticated;

