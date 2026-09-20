-- Customer Join Waiting List → existing staff_notification_events.
-- One event per waiting_list_requests row (event_key waiting_list_new_request:<request_id>).
-- Staff-created requests (created_by_staff_id set) are excluded.
-- Deferred so waiting_list_items exist before the payload is built.
-- Does not change waiting-list eligibility, queue, or RPCs.

alter table public.staff_notification_events
  drop constraint if exists staff_notification_events_code_check;

alter table public.staff_notification_events
  add constraint staff_notification_events_code_check
  check (
    code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute',
      'fresh_pick_walk_in_hold_reminder',
      'waiting_list_new_request'
    )
  );

alter table public.staff_notification_preferences
  drop constraint if exists staff_notification_preferences_code_check;

alter table public.staff_notification_preferences
  add constraint staff_notification_preferences_code_check
  check (
    notification_code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute',
      'fresh_pick_walk_in_hold_reminder',
      'waiting_list_new_request'
    )
  );

create or replace function public._staff_notification_short_date(p_date date)
returns text
language sql
immutable
as $$
  select case
    when p_date is null then null
    else
      ltrim(to_char(p_date, 'DD'), '0')
      || ' '
      || case extract(month from p_date)::integer
        when 1 then 'Jan'
        when 2 then 'Feb'
        when 3 then 'Mar'
        when 4 then 'Apr'
        when 5 then 'May'
        when 6 then 'Jun'
        when 7 then 'Jul'
        when 8 then 'Aug'
        when 9 then 'Sep'
        when 10 then 'Oct'
        when 11 then 'Nov'
        else 'Dec'
      end
  end;
$$;

create or replace function public.staff_notification_emit_waiting_list_new_request(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.waiting_list_requests;
  v_item public.waiting_list_items;
  v_cake_name text;
  v_size_label text;
  v_item_count integer;
  v_display text;
  v_description text;
  v_href text;
begin
  if p_request_id is null then
    return null;
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = p_request_id;

  if v_request.id is null then
    return null;
  end if;
  if v_request.created_by_staff_id is not null then
    return null;
  end if;

  select count(*)::integer
  into v_item_count
  from public.waiting_list_items i
  where i.request_id = v_request.id;

  select i.*
  into v_item
  from public.waiting_list_items i
  where i.request_id = v_request.id
  order by i.queue_position, i.created_at
  limit 1;

  if v_item.id is null then
    return null;
  end if;

  select c.name
  into v_cake_name
  from public.library_cakes c
  where c.id = v_item.library_cake_id;

  select s.label
  into v_size_label
  from public.library_cake_sizes s
  where s.id = v_item.library_cake_size_id;

  v_display := public._staff_notification_cake_display(v_cake_name, v_size_label);
  v_description := concat_ws(
    ' · ',
    nullif(trim(coalesce(v_request.guest_name, '')), ''),
    nullif(trim(coalesce(v_display, '')), ''),
    public._staff_notification_short_date(v_item.pickup_date),
    'Qty ' || coalesce(v_item.quantity, 0)::text
  );
  if v_item_count > 1 then
    v_description := v_description || ' · + ' || (v_item_count - 1)::text || ' more';
  end if;

  v_href :=
    '/bakery/availability?date='
    || v_item.pickup_date::text
    || '&wlCake='
    || v_item.library_cake_id::text;
  if v_item.library_cake_size_id is not null then
    v_href := v_href || '&wlSize=' || v_item.library_cake_size_id::text;
  end if;
  v_href := v_href || '#waiting-list-heading';

  return public.emit_staff_notification_event(
    'waiting_list_new_request:' || v_request.id::text,
    'waiting_list_new_request',
    null,
    null,
    'New waiting list request',
    v_description,
    v_href,
    jsonb_build_object(
      'requestId', v_request.id,
      'itemId', v_item.id,
      'guestName', v_request.guest_name,
      'guestPhone', v_request.guest_phone,
      'cakeId', v_item.library_cake_id,
      'cakeName', v_cake_name,
      'sizeId', v_item.library_cake_size_id,
      'sizeLabel', v_size_label,
      'pickupDate', v_item.pickup_date,
      'quantity', v_item.quantity,
      'itemCount', v_item_count
    )
  );
end;
$$;

revoke all on function public.staff_notification_emit_waiting_list_new_request(uuid)
  from public, anon, authenticated;
revoke all on function public._staff_notification_short_date(date)
  from public, anon, authenticated;

create or replace function public.staff_notification_emit_waiting_list_new_request_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_staff_id is not null then
    return new;
  end if;
  perform public.staff_notification_emit_waiting_list_new_request(new.id);
  return new;
exception
  when others then
    raise warning 'staff notification waiting_list_new_request emit failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_on_waiting_list_request_insert
  on public.waiting_list_requests;
create constraint trigger staff_notification_on_waiting_list_request_insert
after insert on public.waiting_list_requests
deferrable initially deferred
for each row
execute function public.staff_notification_emit_waiting_list_new_request_row();
