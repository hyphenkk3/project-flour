-- new_order content: emit after the INSERT transaction so order_items
-- and fulfilment rows exist. Website preorder inserts orders first,
-- then items, then fulfilment, then timeline — all in one transaction.
--
-- Removes new_order from the immediate orders INSERT trigger (that
-- point cannot see items). last_minute / paid / cancelled stay there.
-- event_key remains new_order:<order_id>. Fresh Picks (extra_stock_id)
-- and cancelled orders are still excluded.

create or replace function public._staff_notification_fulfilment_label(
  p_method public.fulfilment_method
)
returns text
language sql
immutable
as $$
  select case p_method
    when 'dine_in' then 'Dine-in'
    when 'delivery' then 'Delivery'
    else 'Pickup'
  end;
$$;

-- Presentation only. Payload still stores cakeName and sizeLabel separately.
create or replace function public._staff_notification_cake_display(
  p_cake_name text,
  p_size_label text
)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_cake_name, '')), '') is null then
      nullif(trim(coalesce(p_size_label, '')), '')
    when nullif(trim(coalesce(p_size_label, '')), '') is null then
      trim(p_cake_name)
    when position(
      lower(
        replace(replace(replace(trim(p_size_label), chr(8220), '"'), chr(8221), '"'), chr(8243), '"')
      )
      in
      lower(
        replace(replace(replace(trim(p_cake_name), chr(8220), '"'), chr(8221), '"'), chr(8243), '"')
      )
    ) > 0 then
      trim(p_cake_name)
    else
      trim(p_cake_name) || ' · ' || trim(p_size_label)
  end;
$$;

create or replace function public.staff_notification_emit_new_order(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  v_items jsonb;
  v_addons jsonb;
  v_delivery jsonb;
  v_dine jsonb;
  v_total numeric;
  v_first jsonb;
  v_more integer;
  v_cake_summary text;
  v_description text;
  v_payload jsonb;
  v_label text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return null;
  end if;
  if o.status is distinct from 'submitted' then
    return null;
  end if;
  if o.extra_stock_id is not null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cakeName', oi.cake_name,
        'sizeLabel', oi.size_label,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price,
        'lineTotal', oi.quantity * oi.unit_price
      )
      order by oi.created_at
    ),
    '[]'::jsonb
  )
  into v_items
  from public.order_items oi
  where oi.order_id = o.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', pa.name,
        'quantity', pa.quantity,
        'unitPrice', pa.unit_price,
        'lineTotal', pa.quantity * pa.unit_price
      )
      order by pa.sort_order, pa.created_at
    ),
    '[]'::jsonb
  )
  into v_addons
  from public.order_paid_addons pa
  where pa.order_id = o.id;

  select
    coalesce(sum(oi.quantity * oi.unit_price), 0)
    + coalesce(
      (select sum(pa.quantity * pa.unit_price)
       from public.order_paid_addons pa
       where pa.order_id = o.id),
      0
    )
  into v_total
  from public.order_items oi
  where oi.order_id = o.id;

  select jsonb_build_object(
    'recipientName', d.recipient_name,
    'recipientPhone', d.recipient_phone,
    'addressLine1', d.address_line_1,
    'addressLine2', d.address_line_2,
    'postcode', d.postcode,
    'city', d.city,
    'state', d.state
  )
  into v_delivery
  from public.order_delivery_details d
  where d.order_id = o.id;

  select jsonb_build_object(
    'venue', r.venue::text,
    'guestCount', r.guest_count,
    'reservationTime', to_char(r.reservation_time, 'HH24:MI')
  )
  into v_dine
  from public.order_dine_in_reservations r
  where r.order_id = o.id;

  v_label := public._staff_notification_fulfilment_label(o.fulfilment_method);
  v_first := case when jsonb_array_length(v_items) > 0 then v_items -> 0 else null end;
  if v_first is not null then
    v_cake_summary := public._staff_notification_cake_display(
      v_first ->> 'cakeName',
      v_first ->> 'sizeLabel'
    );
    if v_cake_summary is not null then
      v_cake_summary := v_cake_summary || ' × ' || coalesce(v_first ->> 'quantity', '1');
      v_more := jsonb_array_length(v_items) - 1;
      if v_more > 0 then
        v_cake_summary := v_cake_summary || ' + ' || v_more || ' more';
      end if;
    end if;
  end if;

  v_description := concat_ws(
    E'\n',
    concat_ws(
      ' · ',
      nullif(trim(coalesce(o.guest_name, '')), ''),
      nullif(trim(coalesce(v_cake_summary, '')), ''),
      o.pickup_date::text,
      v_label
    ),
    nullif(trim(coalesce(o.order_number, '')), '')
  );

  v_payload := jsonb_build_object(
    'guestName', o.guest_name,
    'guestPhone', o.guest_phone,
    'cakeName', v_first ->> 'cakeName',
    'pickupDate', o.pickup_date,
    'pickupTime', to_char(o.pickup_time, 'HH24:MI'),
    'orderNumber', o.order_number,
    'orderSource', o.order_source,
    'fulfilmentMethod', o.fulfilment_method::text,
    'fulfilmentLabel', v_label,
    'notes', o.customer_notes,
    'items', v_items,
    'addons', v_addons,
    'total', v_total,
    'delivery', v_delivery,
    'dineIn', v_dine
  );

  return public.emit_staff_notification_event(
    'new_order:' || o.id::text,
    'new_order',
    o.id,
    null,
    'New order received',
    v_description,
    '/owner/orders/' || o.id::text,
    v_payload
  );
end;
$$;

revoke all on function public.staff_notification_emit_new_order(uuid)
  from public, anon, authenticated;
revoke all on function public._staff_notification_fulfilment_label(public.fulfilment_method)
  from public, anon, authenticated;
revoke all on function public._staff_notification_cake_display(text, text)
  from public, anon, authenticated;

create or replace function public.staff_notification_emit_new_order_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.staff_notification_emit_new_order(new.id);
  return new;
exception
  when others then
    raise warning 'staff notification new_order emit failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_on_orders_insert_new_order
  on public.orders;
create constraint trigger staff_notification_on_orders_insert_new_order
after insert on public.orders
deferrable initially deferred
for each row
execute function public.staff_notification_emit_new_order_row();

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
