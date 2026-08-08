-- Milestone 3 Preview 3A-2 — Owner staff-created guest preorders (additive)
-- Does not amend 3A-1 or Preview 2 migrations.
-- Website submit_guest_preorder remains phone-required and customer_website-only.
-- Product Review correction (unapplied): pickup_instruction + Library cakes (no Collection gate).

alter table public.orders
  add column if not exists pickup_instruction text;

comment on column public.orders.pickup_instruction is
  'Optional human-facing pickup wording (e.g. Before 3pm). '
  'pickup_time remains a sortable Postgres time. Not Bakery Attention.';

-- Drop any earlier unsigned overload from the first 3A-2 draft if present.
drop function if exists public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, jsonb, jsonb,
  boolean, boolean, text, text, text
);

create or replace function public.create_staff_guest_preorder(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_crew_order boolean,
  p_pickup_date date,
  p_pickup_time time,
  p_pickup_instruction text,
  p_items jsonb,
  p_complimentary jsonb,
  p_include_receipt boolean,
  p_needs_bakery_attention boolean,
  p_bakery_attention_note text,
  p_customer_notes text,
  p_internal_notes text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  complimentary jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  v_email text;
  v_phone text;
  v_source text;
  v_attention_note text;
  v_pickup_instruction text;
  v_type_id uuid;
  v_comp_name text;
  v_comp_qty integer;
  v_comp_sort integer;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Customer name is required';
  end if;

  v_source := nullif(trim(coalesce(p_order_source, '')), '');
  if v_source is null then
    raise exception 'Order source is required';
  end if;
  if v_source = 'customer_website' then
    raise exception 'Staff-created orders cannot use customer_website source';
  end if;
  if v_source not in (
    'jotform',
    'whatsapp',
    'whitebird_instagram',
    'wee',
    'lex',
    'other',
    'walk_in',
    'last_minute'
  ) then
    raise exception 'Invalid order source';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Pickup date and time are required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_attention_note := nullif(trim(coalesce(p_bakery_attention_note, '')), '');
  v_pickup_instruction := nullif(trim(coalesce(p_pickup_instruction, '')), '');

  if coalesce(p_needs_bakery_attention, false) = false then
    v_attention_note := null;
  end if;

  -- collection_id is informational only for staff-created orders.
  -- Cake selection is Master Library (active/seasonal), not Collection membership.
  select c.*
  into active_collection
  from public.collections c
  where c.status = 'active'
  order by c.month desc
  limit 1;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    pickup_instruction,
    status,
    payment_status,
    customer_notes,
    internal_notes,
    collection_id,
    confirmation_needs_resend,
    order_source,
    crew_order,
    include_receipt,
    needs_bakery_attention,
    bakery_attention_note,
    email_submission_receipt_requested,
    created_by,
    updated_by
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    v_phone,
    v_email,
    'pickup',
    p_pickup_date,
    p_pickup_time,
    v_pickup_instruction,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_customer_notes, '')), ''),
    nullif(trim(coalesce(p_internal_notes, '')), ''),
    active_collection.id,
    false,
    v_source,
    coalesce(p_crew_order, false),
    coalesce(p_include_receipt, false),
    coalesce(p_needs_bakery_attention, false),
    v_attention_note,
    false,
    p_actor_staff_id,
    p_actor_staff_id
  )
  returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_cake_id := (item ->> 'cake_id')::uuid;
    v_size_id := (item ->> 'cake_size_id')::uuid;
    v_qty := coalesce((item ->> 'quantity')::integer, 1);

    if v_qty < 1 then
      raise exception 'Quantity must be at least 1';
    end if;

    -- Master Library only — no collection_cakes check.
    select lc.*
    into cake_row
    from public.library_cakes lc
    where lc.id = v_cake_id
      and lc.status in ('active', 'seasonal');
    if not found then
      raise exception 'Cake is not available in the Library';
    end if;

    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id
      and lcs.cake_id = v_cake_id;
    if not found then
      raise exception 'Cake size is not available';
    end if;

    insert into public.order_items (
      order_id,
      cake_id,
      cake_size_id,
      quantity,
      unit_price,
      cake_name,
      size_label
    )
    values (
      new_order.id,
      cake_row.id,
      size_row.id,
      v_qty,
      size_row.price,
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_comp_qty := coalesce((complimentary ->> 'quantity')::integer, 0);
      if v_comp_qty <= 0 then
        continue;
      end if;

      v_comp_name := nullif(trim(coalesce(complimentary ->> 'name', '')), '');
      if v_comp_name is null then
        raise exception 'Complimentary item name is required';
      end if;

      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception
        when others then
          v_type_id := null;
      end;

      v_comp_sort := coalesce((complimentary ->> 'sort_order')::integer, 0);

      insert into public.order_complimentary_items (
        order_id,
        complimentary_item_type_id,
        name,
        quantity,
        sort_order
      )
      values (
        new_order.id,
        v_type_id,
        v_comp_name,
        v_comp_qty,
        v_comp_sort
      );
    end loop;
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    new_order.id,
    'staff_preorder_created',
    p_actor_staff_id,
    jsonb_build_object(
      'item_count', item_count,
      'order_source', v_source,
      'crew_order', coalesce(p_crew_order, false),
      'include_receipt', coalesce(p_include_receipt, false),
      'needs_bakery_attention', coalesce(p_needs_bakery_attention, false),
      'created_via', 'owner_staff'
    )
  );

  return new_order;
end;
$$;

revoke all on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text
) from public;

grant execute on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text
) to authenticated;
