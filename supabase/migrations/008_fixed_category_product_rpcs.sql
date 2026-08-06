-- The v1 category list is fixed. Product forms submit the stable category code
-- and the database resolves it to the internal UUID.

create or replace function public.create_draft_product_by_category_code(
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_code text,
  p_short_description text,
  p_description text
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_category_id uuid;
begin
  select id into v_category_id
  from public.categories
  where lower(code) = lower(trim(p_category_code))
    and is_active = true;

  if v_category_id is null then
    raise exception 'Category is unavailable. Run migration 007_repair_master_categories.sql.';
  end if;

  return public.create_draft_product(
    p_product_code,
    p_product_name,
    p_slug,
    v_category_id,
    p_short_description,
    p_description
  );
end;
$$;

revoke all on function public.create_draft_product_by_category_code(
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_draft_product_by_category_code(
  text, text, text, text, text, text
) to authenticated;

create or replace function public.update_product_basic_by_category_code(
  p_product_id uuid,
  p_expected_version integer,
  p_product_code text,
  p_product_name text,
  p_slug text,
  p_category_code text,
  p_short_description text,
  p_description text
)
returns public.products
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_category_id uuid;
begin
  select id into v_category_id
  from public.categories
  where lower(code) = lower(trim(p_category_code))
    and is_active = true;

  if v_category_id is null then
    raise exception 'Category is unavailable. Run migration 007_repair_master_categories.sql.';
  end if;

  return public.update_product_basic(
    p_product_id,
    p_expected_version,
    p_product_code,
    p_product_name,
    p_slug,
    v_category_id,
    p_short_description,
    p_description
  );
end;
$$;

revoke all on function public.update_product_basic_by_category_code(
  uuid, integer, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_product_basic_by_category_code(
  uuid, integer, text, text, text, text, text, text
) to authenticated;

