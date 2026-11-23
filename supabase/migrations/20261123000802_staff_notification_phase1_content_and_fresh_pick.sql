-- Phase 1 notification content and Fresh Pick classification.
-- This migration changes notification rows only; it does not change orders,
-- payment/confirmation lifecycle, or any customer/business data.

create or replace function public.emit_staff_notification_event(
  p_event_key text,
  p_code text,
  p_order_id uuid,
  p_approval_id uuid,
  p_title text,
  p_description text,
  p_href text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  authoritative_title text;
begin
  -- A Last Minute order source is already emitted as last_minute by the
  -- orders trigger. Prevent the deferred generic producer from duplicating it.
  if p_code = 'new_order'
     and p_order_id is not null
     and exists (
       select 1 from public.orders o
       where o.id = p_order_id
         and o.order_source = 'last_minute'
     ) then
    return null;
  end if;

  authoritative_title := case p_code
    when 'new_order' then 'New Order'
    when 'last_minute' then 'Last Minute Order'
    when 'order_paid' then 'Order Paid'
    when 'order_confirmed' then 'Order Confirmed'
    when 'order_cancelled' then 'Order Cancelled'
    when 'order_edited' then 'Order Edited'
    when 'approval_required' then 'Approval Required'
    else p_title
  end;

  insert into public.staff_notification_events (
    event_key,
    code,
    order_id,
    approval_id,
    title,
    description,
    href,
    payload
  )
  values (
    p_event_key,
    p_code,
    p_order_id,
    p_approval_id,
    authoritative_title,
    coalesce(p_description, ''),
    p_href,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into inserted_id;

  return inserted_id;
exception
  when others then
    raise warning 'staff notification emit failed: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.emit_staff_notification_event(
  text, text, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

create or replace function public.staff_notification_emit_fresh_pick_order_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_cake_name text;
  v_description text;
begin
  -- Constraint triggers run at commit. Re-read the row so an insert followed
  -- by an update in the same transaction is classified from final state.
  select * into v_order
  from public.orders o
  where o.id = new.id;

  -- Customer Fresh Pick checkout uses customer_website plus the physical
  -- extra_stock_id. Regular preorder uses customer_website with no stock ID.
  if not found
     or v_order.status is distinct from 'submitted'
     or v_order.order_source is distinct from 'customer_website'
     or v_order.extra_stock_id is null then
    return new;
  end if;

  v_cake_name := public._staff_notification_order_cake_name(v_order.id);
  v_description := public._staff_notification_order_description(
    v_order.guest_name,
    v_cake_name,
    v_order.pickup_date,
    v_order.order_number
  );

  perform public.emit_staff_notification_event(
    'last_minute:' || v_order.id::text,
    'last_minute',
    v_order.id,
    null,
    'Last Minute Order',
    coalesce(v_description, 'A new Fresh Pick order needs attention.'),
    '/owner/orders/' || new.id::text,
    jsonb_build_object(
      'orderSource', v_order.order_source,
      'fulfilmentMethod', v_order.fulfilment_method::text,
      'extraStockId', v_order.extra_stock_id
    )
  );

  return new;
exception
  when others then
    raise warning 'staff Fresh Pick notification emit failed: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.staff_notification_emit_fresh_pick_order_row()
  from public, anon, authenticated;

drop trigger if exists staff_notification_on_fresh_pick_order_insert
  on public.orders;
create constraint trigger staff_notification_on_fresh_pick_order_insert
after insert on public.orders
deferrable initially deferred
for each row
execute function public.staff_notification_emit_fresh_pick_order_row();
