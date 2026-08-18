-- Order cutoff may be the pickup-from calendar date or the next calendar
-- day (at most +1). Pickup from remains Singapore today or tomorrow.
-- Additive: replace assert body only. Do not rewrite Extra RPCs.

create or replace function public._assert_fresh_picks_confirm_window(
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz
)
returns void
language plpgsql
as $$
declare
  v_sg_today date;
  v_sg_tomorrow date;
  v_from_sg timestamp;
  v_through_sg timestamp;
  v_from_date date;
  v_through_date date;
begin
  if p_pickup_available_from_at is null then
    raise exception 'Pickup available from is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Order cutoff is required';
  end if;

  v_sg_today := (timezone('Asia/Singapore', now()))::date;
  v_sg_tomorrow := v_sg_today + 1;
  v_from_sg := timezone('Asia/Singapore', p_pickup_available_from_at);
  v_through_sg := timezone('Asia/Singapore', p_pickup_through_at);
  v_from_date := v_from_sg::date;
  v_through_date := v_through_sg::date;

  if v_from_date <> v_sg_today and v_from_date <> v_sg_tomorrow then
    raise exception 'Fresh Picks pickup and order-cutoff dates must be today or tomorrow.';
  end if;

  if v_through_date < v_from_date then
    raise exception 'Pickup available from must not be after the order cutoff.';
  end if;
  if v_through_date > v_from_date + 1 then
    raise exception 'Order cutoff must be on the pickup-from date or the next calendar day.';
  end if;

  if not public._pickup_slot_in_weekly_hours(v_from_date, v_from_sg::time) then
    raise exception 'Pickup available from must be a valid bakery pickup time for that date.';
  end if;
  if not public._pickup_slot_in_weekly_hours(v_through_date, v_through_sg::time) then
    raise exception 'Orders available through must be a valid 30-minute time on that date.';
  end if;

  if p_pickup_available_from_at > p_pickup_through_at then
    raise exception 'Pickup available from must not be after the order cutoff.';
  end if;

  if p_pickup_through_at <= now() then
    raise exception 'That order cutoff has already passed. Choose a later time.';
  end if;
end;
$$;
