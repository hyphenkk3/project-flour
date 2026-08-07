-- Preview 2 correction: allow Owner order item sync through payment lifecycle.
-- Verified payments remain immutable; this only widens status allowlist for edits.
-- Additive. Does not modify previously applied migrations.

create or replace function public.sync_guest_order_items(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  item jsonb;
  v_cake_id uuid;
  v_size_id uuid;
  v_qty integer;
  v_unit_price numeric(10, 2);
  v_cake_name text;
  v_size_label text;
  item_count integer := 0;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- Active preorder lifecycle: payment does not freeze the order.
  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order can no longer be edited';
  end if;

  delete from public.order_items oi
  where oi.order_id = p_order_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_cake_id := (item ->> 'cake_id')::uuid;
    v_size_id := (item ->> 'cake_size_id')::uuid;
    v_qty := coalesce((item ->> 'quantity')::integer, 0);
    v_unit_price := coalesce((item ->> 'unit_price')::numeric, 0);
    v_cake_name := nullif(trim(coalesce(item ->> 'cake_name', '')), '');
    v_size_label := nullif(trim(coalesce(item ->> 'size_label', '')), '');

    if v_cake_id is null or v_size_id is null then
      raise exception 'Each item requires cake and size';
    end if;
    if v_qty < 1 then
      raise exception 'Quantity must be at least 1';
    end if;
    if v_cake_name is null or v_size_label is null then
      raise exception 'Each item requires cake name and size label snapshots';
    end if;
    if v_unit_price < 0 then
      raise exception 'Unit price cannot be negative';
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
      p_order_id,
      v_cake_id,
      v_size_id,
      v_qty,
      v_unit_price,
      v_cake_name,
      v_size_label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;
end;
$$;

revoke all on function public.sync_guest_order_items(uuid, jsonb) from public;
grant execute on function public.sync_guest_order_items(uuid, jsonb) to authenticated;

comment on function public.sync_guest_order_items(uuid, jsonb) is
  'Owner Order Workspace item sync. Allowed while submitted, pending_confirmation, awaiting_payment, or paid. Does not mutate payments.';
