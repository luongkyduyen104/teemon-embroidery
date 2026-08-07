-- ============================================================
-- 031_google_sheet_product_import.sql
--
-- Server-side Google Sheet product import.
-- Called only by Cloudflare using service_role.
--
-- One PostgreSQL function = one transaction:
-- Product + Colors + Sizes + Variants + Keywords + Design Note
-- + Mockups + Charts + Fulfillment + Activity Log
-- ============================================================


-- ------------------------------------------------------------
-- Allow server-side service_role operations to synchronize
-- variants while keeping the existing Admin restriction for
-- normal authenticated users.
-- ------------------------------------------------------------

create or replace function public.sync_product_variants(
  p_product_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role'
     and not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  insert into public.product_variants(
    product_id,
    color_id,
    size_id
  )
  select
    p_product_id,
    pc.color_id,
    ps.size_id
  from public.product_colors pc
  cross join public.product_sizes ps
  where pc.product_id = p_product_id
    and ps.product_id = p_product_id
  on conflict(product_id, color_id, size_id)
  do update set
    active = true,
    updated_at = now();

  update public.product_variants pv
  set
    active = false,
    updated_at = now()
  where pv.product_id = p_product_id
    and (
      not exists (
        select 1
        from public.product_colors pc
        where pc.product_id = p_product_id
          and pc.color_id = pv.color_id
      )
      or
      not exists (
        select 1
        from public.product_sizes ps
        where ps.product_id = p_product_id
          and ps.size_id = pv.size_id
      )
    );

  select count(*)
  into v_count
  from public.product_variants
  where product_id = p_product_id
    and active = true;

  return v_count;
end;
$$;


-- ------------------------------------------------------------
-- Complete Google Sheet product import.
-- ------------------------------------------------------------

create or replace function public.google_sheet_import_product(
  p_actor_user_id uuid,
  p_product jsonb,
  p_fulfillment jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_email text;

  v_product_id uuid;
  v_category_id uuid;

  v_product_code text;
  v_product_name text;
  v_slug text;
  v_category_code text;
  v_short_description text;
  v_description text;
  v_design_note text;

  v_size_chart_url text;
  v_color_chart_url text;

  v_keywords text[] := '{}'::text[];
  v_color_ids uuid[] := '{}'::uuid[];
  v_size_ids uuid[] := '{}'::uuid[];

  v_name text;
  v_code text;
  v_option_id uuid;
  v_display_order integer;

  v_image_url text;
  v_image_index integer := 0;

  v_fulfillment_item jsonb;
  v_fulfillment_size text;
  v_fulfillment_size_id uuid;

  v_variant_count integer := 0;
begin

  -- ----------------------------------------------------------
  -- Security
  -- ----------------------------------------------------------

  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_actor_user_id is null then
    raise exception 'Actor user ID is required';
  end if;

  select u.email
  into v_actor_email
  from auth.users u
  join public.profiles p
    on p.id = u.id
  where u.id = p_actor_user_id
    and p.active = true
    and p.role = 'admin';

  if v_actor_email is null then
    raise exception
      'Google Sheet actor must be an active Admin';
  end if;


  -- ----------------------------------------------------------
  -- Product fields
  -- ----------------------------------------------------------

  v_product_code :=
    nullif(trim(p_product->>'product_code'), '');

  v_product_name :=
    nullif(trim(p_product->>'product_name'), '');

  v_slug :=
    nullif(lower(trim(p_product->>'slug')), '');

  v_category_code :=
    nullif(upper(trim(p_product->>'category_code')), '');

  v_short_description :=
    nullif(trim(p_product->>'short_description'), '');

  v_description :=
    nullif(trim(p_product->>'description'), '');

  v_design_note :=
    nullif(trim(p_product->>'design_note'), '');

  v_size_chart_url :=
    nullif(trim(p_product->>'size_chart_url'), '');

  v_color_chart_url :=
    nullif(trim(p_product->>'color_chart_url'), '');


  -- ----------------------------------------------------------
  -- Validation
  -- ----------------------------------------------------------

  if v_product_code is null then
    raise exception 'Product code is required';
  end if;

  if v_product_name is null
     or char_length(v_product_name) < 2 then
    raise exception
      'Product name must contain at least 2 characters';
  end if;

  if v_slug is null
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception
      'Slug must contain lowercase letters, numbers and hyphens only';
  end if;

  if v_category_code is null then
    raise exception 'Category code is required';
  end if;

  if v_description is null then
    raise exception 'Description is required';
  end if;

  if v_short_description is not null
     and char_length(v_short_description) > 500 then
    raise exception
      'Short description must not exceed 500 characters';
  end if;

  if v_design_note is not null
     and char_length(v_design_note) > 10000 then
    raise exception
      'Design note must not exceed 10000 characters';
  end if;


  -- ----------------------------------------------------------
  -- Duplicate checks
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.products
    where lower(product_code) = lower(v_product_code)
  ) then
    raise exception
      'Product code already exists: %',
      v_product_code;
  end if;

  if exists (
    select 1
    from public.products
    where lower(slug) = lower(v_slug)
  ) then
    raise exception
      'Slug already exists: %',
      v_slug;
  end if;


  -- ----------------------------------------------------------
  -- Category
  -- ----------------------------------------------------------

  select id
  into v_category_id
  from public.categories
  where lower(code) = lower(v_category_code)
    and is_active = true
  limit 1;

  if v_category_id is null then
    raise exception
      'Category is unavailable: %',
      v_category_code;
  end if;


  -- ----------------------------------------------------------
  -- Keywords
  -- ----------------------------------------------------------

  if jsonb_typeof(p_product->'keywords') = 'array' then
    select coalesce(
      array_agg(distinct lower(trim(value))),
      '{}'::text[]
    )
    into v_keywords
    from jsonb_array_elements_text(
      p_product->'keywords'
    ) item(value)
    where nullif(trim(value), '') is not null
      and char_length(trim(value)) <= 60;

    v_keywords :=
      public.normalize_product_keywords(v_keywords);
  end if;


  -- ----------------------------------------------------------
  -- Colors
  -- ----------------------------------------------------------

  if jsonb_typeof(p_product->'colors') <> 'array'
     or jsonb_array_length(p_product->'colors') = 0 then
    raise exception 'Select at least one color';
  end if;

  for v_name in
    select distinct trim(value)
    from jsonb_array_elements_text(
      p_product->'colors'
    ) item(value)
    where nullif(trim(value), '') is not null
  loop

    v_option_id := null;

    select id
    into v_option_id
    from public.colors
    where lower(name) = lower(v_name)
       or lower(code) = lower(v_name)
    order by
      case
        when lower(name) = lower(v_name) then 0
        else 1
      end
    limit 1;

    if v_option_id is not null then

      update public.colors
      set
        is_active = true,
        updated_at = now()
      where id = v_option_id;

    else

      v_code :=
        nullif(
          regexp_replace(
            upper(v_name),
            '[^A-Z0-9]+',
            '-',
            'g'
          ),
          ''
        );

      v_code :=
        trim(
          both '-'
          from coalesce(v_code, 'COLOR')
        );

      while exists (
        select 1
        from public.colors
        where lower(code) = lower(v_code)
      ) loop
        v_code :=
          left(v_code, 45)
          || '-'
          || floor(random() * 900 + 100)::integer::text;
      end loop;

      insert into public.colors(
        code,
        name,
        hex_code
      )
      values (
        v_code,
        v_name,
        null
      )
      returning id into v_option_id;

    end if;

    v_color_ids :=
      array_append(v_color_ids, v_option_id);

  end loop;


  -- ----------------------------------------------------------
  -- Sizes
  -- ----------------------------------------------------------

  if jsonb_typeof(p_product->'sizes') <> 'array'
     or jsonb_array_length(p_product->'sizes') = 0 then
    raise exception 'Select at least one size';
  end if;

  for v_name in
    select distinct trim(value)
    from jsonb_array_elements_text(
      p_product->'sizes'
    ) item(value)
    where nullif(trim(value), '') is not null
  loop

    v_option_id := null;

    select id
    into v_option_id
    from public.sizes
    where lower(name) = lower(v_name)
       or lower(code) = lower(v_name)
    order by
      case
        when lower(name) = lower(v_name) then 0
        else 1
      end
    limit 1;

    if v_option_id is not null then

      update public.sizes
      set
        is_active = true,
        updated_at = now()
      where id = v_option_id;

    else

      v_code :=
        nullif(
          regexp_replace(
            upper(v_name),
            '[^A-Z0-9]+',
            '-',
            'g'
          ),
          ''
        );

      v_code :=
        trim(
          both '-'
          from coalesce(v_code, 'SIZE')
        );

      while exists (
        select 1
        from public.sizes
        where lower(code) = lower(v_code)
      ) loop
        v_code :=
          left(v_code, 45)
          || '-'
          || floor(random() * 900 + 100)::integer::text;
      end loop;

      select
        coalesce(max(display_order), 0) + 10
      into v_display_order
      from public.sizes;

      insert into public.sizes(
        code,
        name,
        display_order
      )
      values (
        v_code,
        v_name,
        v_display_order
      )
      returning id into v_option_id;

    end if;

    v_size_ids :=
      array_append(v_size_ids, v_option_id);

  end loop;


  -- ----------------------------------------------------------
  -- Create Draft Product
  -- ----------------------------------------------------------

  insert into public.products(
    product_code,
    product_name,
    slug,
    category_id,
    short_description,
    description,
    publication_status,
    version,
    created_by,
    updated_by,
    is_featured,
    keywords,
    design_note
  )
  values (
    v_product_code,
    v_product_name,
    v_slug,
    v_category_id,
    v_short_description,
    v_description,
    'DRAFT',
    1,
    p_actor_user_id,
    p_actor_user_id,
    false,
    v_keywords,
    v_design_note
  )
  returning id into v_product_id;


  -- ----------------------------------------------------------
  -- Product Colors
  -- ----------------------------------------------------------

  insert into public.product_colors(
    product_id,
    color_id
  )
  select
    v_product_id,
    unnest(v_color_ids);


  -- ----------------------------------------------------------
  -- Product Sizes
  -- ----------------------------------------------------------

  insert into public.product_sizes(
    product_id,
    size_id
  )
  select
    v_product_id,
    unnest(v_size_ids);


  -- Triggers synchronize Color x Size variants.
  select count(*)
  into v_variant_count
  from public.product_variants
  where product_id = v_product_id
    and active = true;


  -- ----------------------------------------------------------
  -- Mockup images
  -- ----------------------------------------------------------

  if jsonb_typeof(p_product->'mockup_urls') = 'array' then

    for v_image_url in
      select trim(value)
      from jsonb_array_elements_text(
        p_product->'mockup_urls'
      ) item(value)
      where nullif(trim(value), '') is not null
    loop

      v_image_index := v_image_index + 1;

      if v_image_index > 7 then
        raise exception
          'A product can contain at most 7 images';
      end if;

      if v_image_url !~* '^https://' then
        raise exception
          'Mockup image URL must start with https://';
      end if;

      insert into public.product_images(
        product_id,
        storage_path,
        image_url,
        alt_text,
        is_thumbnail,
        display_order
      )
      values (
        v_product_id,
        'external/'
          || v_product_id::text
          || '/'
          || v_image_index::text,
        v_image_url,
        v_product_name
          || ' mockup '
          || v_image_index::text,
        v_image_index = 1,
        v_image_index - 1
      );

    end loop;

  end if;


  -- ----------------------------------------------------------
  -- Charts
  -- ----------------------------------------------------------

  if v_size_chart_url is not null
     or v_color_chart_url is not null then

    insert into public.product_charts(
      product_id,
      size_chart_url,
      color_chart_url,
      updated_by
    )
    values (
      v_product_id,
      v_size_chart_url,
      v_color_chart_url,
      p_actor_user_id
    )
    on conflict(product_id)
    do update set
      size_chart_url = excluded.size_chart_url,
      color_chart_url = excluded.color_chart_url,
      updated_by = p_actor_user_id,
      updated_at = now();

  end if;


  -- ----------------------------------------------------------
  -- Fulfillment
  -- ----------------------------------------------------------

  if p_fulfillment is null then
    p_fulfillment := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_fulfillment) <> 'array' then
    raise exception
      'Fulfillment must be an array';
  end if;

  for v_fulfillment_item in
    select value
    from jsonb_array_elements(p_fulfillment)
  loop

    v_fulfillment_size :=
      nullif(
        trim(v_fulfillment_item->>'size'),
        ''
      );

    if v_fulfillment_size is null then
      raise exception
        'Fulfillment size is required';
    end if;

    v_fulfillment_size_id := null;

    select s.id
    into v_fulfillment_size_id
    from public.sizes s
    where s.id = any(v_size_ids)
      and (
        lower(s.name) =
          lower(v_fulfillment_size)
        or
        lower(s.code) =
          lower(v_fulfillment_size)
      )
    limit 1;

    if v_fulfillment_size_id is null then
      raise exception
        'Fulfillment size "%" is not selected for this product',
        v_fulfillment_size;
    end if;

    insert into public.product_size_fulfillment(
      product_id,
      size_id,
      weight_grams,
      base_cost,
      shipping_estimates,
      currency,
      updated_by,
      updated_at
    )
    values (
      v_product_id,
      v_fulfillment_size_id,
      nullif(
        v_fulfillment_item->>'weight_grams',
        ''
      )::numeric,
      nullif(
        v_fulfillment_item->>'base_cost',
        ''
      )::numeric,
      coalesce(
        v_fulfillment_item->'shipping_estimates',
        '{}'::jsonb
      ),
      upper(
        coalesce(
          nullif(
            trim(
              v_fulfillment_item->>'currency'
            ),
            ''
          ),
          'USD'
        )
      ),
      p_actor_user_id,
      now()
    );

  end loop;


  -- ----------------------------------------------------------
  -- Activity Log
  -- ----------------------------------------------------------

  insert into public.activity_logs(
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  )
  values (
    p_actor_user_id,
    v_actor_email,
    'CREATE_PRODUCT',
    'product',
    v_product_id::text,
    jsonb_build_object(
      'product_code', v_product_code,
      'product_name', v_product_name,
      'slug', v_slug,
      'category_id', v_category_id,
      'publication_status', 'DRAFT',
      'color_ids', to_jsonb(v_color_ids),
      'size_ids', to_jsonb(v_size_ids),
      'variant_count', v_variant_count,
      'image_count', v_image_index
    ),
    jsonb_build_object(
      'source', 'google_sheets',
      'integration', 'PRODUCT_NEW'
    )
  );


  -- ----------------------------------------------------------
  -- Response
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'success', true,
    'id', v_product_id,
    'product_code', v_product_code,
    'product_name', v_product_name,
    'publication_status', 'DRAFT',
    'color_count', cardinality(v_color_ids),
    'size_count', cardinality(v_size_ids),
    'variant_count', v_variant_count,
    'image_count', v_image_index,
    'fulfillment_count',
      jsonb_array_length(p_fulfillment)
  );

end;
$$;


-- ------------------------------------------------------------
-- Lock down RPC.
-- Only service_role may execute it.
-- ------------------------------------------------------------

revoke all on function public.google_sheet_import_product(
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.google_sheet_import_product(
  uuid,
  jsonb,
  jsonb
) to service_role;


notify pgrst, 'reload schema';