-- Web new_order toasts never appeared for website preorders.
--
-- Cause: staff_notification_on_orders / staff_notification_on_timeline
-- referenced orders.cake_name, which does not exist (cake names are on
-- order_items). The trigger EXCEPTION handler swallowed
--   record "new" has no field "cake_name"
-- so no staff_notification_events row was inserted and Realtime never fired.
--
-- Fix: read cake name from order_items. On orders INSERT, items are not
-- present yet, so cake name may be null; the event still emits.
-- Does not change event codes, RLS, Realtime publication, or email dispatch.

create or replace function public._staff_notification_order_cake_name(
  p_order_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select oi.cake_name
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.created_at
  limit 1;
$$;

revoke all on function public._staff_notification_order_cake_name(uuid)
  from public, anon, authenticated;

create or replace function public.staff_notification_on_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cake_name text;
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  v_cake_name := public._staff_notification_order_cake_name(new.id);
  v_href := '/owner/orders/' || new.id::text;
  v_description := public._staff_notification_order_description(
    new.guest_name,
    v_cake_name,
    new.pickup_date,
    new.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', new.guest_name,
    'cakeName', v_cake_name,
    'pickupDate', new.pickup_date,
    'orderNumber', new.order_number,
    'orderSource', new.order_source
  );

  if tg_op = 'INSERT' then
    if new.status is distinct from 'cancelled' then
      if new.status = 'submitted' and new.extra_stock_id is null then
        perform public.emit_staff_notification_event(
          'new_order:' || new.id::text,
          'new_order',
          new.id,
          null,
          'New order received',
          v_description,
          v_href,
          v_payload
        );
      end if;

      if new.order_source = 'last_minute' then
        perform public.emit_staff_notification_event(
          'last_minute:' || new.id::text,
          'last_minute',
          new.id,
          null,
          'Last-minute order',
          v_description,
          v_href,
          v_payload
        );
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform public.emit_staff_notification_event(
        'order_cancelled:' || new.id::text,
        'order_cancelled',
        new.id,
        null,
        'Order cancelled',
        v_description,
        v_href,
        v_payload
      );
      return new;
    end if;

    if new.status = 'cancelled' then
      return new;
    end if;

    if (
      new.status = 'paid'
      or new.payment_status = 'paid'
    )
      and not (
        old.status = 'paid'
        or old.payment_status = 'paid'
      )
    then
      perform public.emit_staff_notification_event(
        'order_paid:' || new.id::text,
        'order_paid',
        new.id,
        null,
        'Order paid',
        v_description,
        v_href,
        v_payload
      );
    end if;

    if new.order_source = 'last_minute'
      and old.order_source is distinct from 'last_minute'
    then
      perform public.emit_staff_notification_event(
        'last_minute:' || new.id::text,
        'last_minute',
        new.id,
        null,
        'Last-minute order',
        v_description,
        v_href,
        v_payload
      );
    end if;
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification orders trigger failed: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.staff_notification_on_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_cake_name text;
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  select *
    into order_row
  from public.orders
  where id = new.order_id;

  if not found then
    return new;
  end if;

  if order_row.status = 'cancelled' then
    return new;
  end if;

  v_cake_name := public._staff_notification_order_cake_name(order_row.id);
  v_href := '/owner/orders/' || order_row.id::text;
  v_description := public._staff_notification_order_description(
    order_row.guest_name,
    v_cake_name,
    order_row.pickup_date,
    order_row.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', order_row.guest_name,
    'cakeName', v_cake_name,
    'pickupDate', order_row.pickup_date,
    'orderNumber', order_row.order_number
  );

  if new.event_type = 'customer_confirmed' then
    perform public.emit_staff_notification_event(
      'order_confirmed:' || order_row.id::text,
      'order_confirmed',
      order_row.id,
      null,
      'Order confirmed',
      v_description,
      v_href,
      v_payload
    );
  elsif new.event_type = 'order_updated' then
    perform public.emit_staff_notification_event(
      'order_edited:' || new.id::text,
      'order_edited',
      order_row.id,
      null,
      'Order edited',
      v_description,
      v_href,
      v_payload
    );
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification timeline trigger failed: %', sqlerrm;
    return new;
end;
$$;
