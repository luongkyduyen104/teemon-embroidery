-- Internal production/design instructions. This value is intentionally omitted
-- from every public catalog RPC and can only be read by an active signed-in user.
alter table public.products
  add column if not exists design_note text;

alter table public.products
  drop constraint if exists products_design_note_length_check;
alter table public.products
  add constraint products_design_note_length_check
  check (design_note is null or char_length(design_note) <= 10000);

create or replace function public.save_product_design_note(
  p_product_id uuid,
  p_design_note text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  update public.products
  set design_note = nullif(trim(p_design_note), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_product_id;

  if not found then raise exception 'Product not found'; end if;
  return nullif(trim(p_design_note), '');
end;
$$;

create or replace function public.authorized_product_design_note(p_slug text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_note text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  ) then
    raise exception 'Active signed-in account required';
  end if;

  select p.design_note into v_note
  from public.products p
  where lower(p.slug) = lower(trim(p_slug))
    and p.publication_status = 'PUBLISHED';
  return v_note;
end;
$$;

revoke all on function public.save_product_design_note(uuid,text) from public, anon;
grant execute on function public.save_product_design_note(uuid,text) to authenticated;
revoke all on function public.authorized_product_design_note(text) from public, anon;
grant execute on function public.authorized_product_design_note(text) to authenticated;
notify pgrst, 'reload schema';
