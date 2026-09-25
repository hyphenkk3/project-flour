-- Catalogue voucher order-type eligibility (preorder / Fresh Picks).
-- Fresh Picks source of truth remains orders.extra_stock_id.
-- Absent order_type rule imposes no restriction.

alter type public.library_voucher_rule_type add value if not exists 'order_type';

alter table public.library_voucher_rule_values
  add column if not exists value_code text;

alter table public.library_voucher_rule_values
  drop constraint if exists library_voucher_rule_values_has_target;

alter table public.library_voucher_rule_values
  add constraint library_voucher_rule_values_has_target check (
    cake_id is not null
    or cake_size_id is not null
    or nullif(trim(coalesce(size_label, '')), '') is not null
    or nullif(trim(coalesce(value_code, '')), '') is not null
  );

create unique index if not exists library_voucher_rule_values_value_code_unique
  on public.library_voucher_rule_values (rule_id, lower(trim(value_code)))
  where value_code is not null;

create or replace function public.list_public_catalogue_vouchers()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_today date := public.singapore_calendar_date(now());
begin
  return coalesce((
    select jsonb_agg(row_to_json(v)::jsonb order by v.code)
    from (
      select
        lv.id,
        lv.code,
        lv.voucher_type,
        lv.value,
        lv.valid_from,
        lv.valid_until,
        lv.status,
        lv.image_url,
        lv.asset_id,
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id,
            'rule_type', r.rule_type,
            'date_from', r.date_from,
            'date_until', r.date_until,
            'amount', r.amount,
            'values', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'cake_id', rv.cake_id,
                'cake_name', (
                  select c.name
                  from public.library_cakes c
                  where c.id = rv.cake_id
                ),
                'cake_size_id', rv.cake_size_id,
                'size_label', rv.size_label,
                'value_code', rv.value_code
              )), '[]'::jsonb)
              from public.library_voucher_rule_values rv
              where rv.rule_id = r.id
            )
          )), '[]'::jsonb)
          from public.library_voucher_rules r
          where r.voucher_id = lv.id
        ) as rules
      from public.library_vouchers lv
      where lv.status = 'active'
        and lv.voucher_type in ('fixed_amount', 'percentage')
        and (lv.valid_from is null or lv.valid_from <= v_today)
        and (lv.valid_until is null or lv.valid_until >= v_today)
    ) v
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_public_catalogue_vouchers() from public;
grant execute on function public.list_public_catalogue_vouchers() to anon, authenticated;

create or replace function public.apply_catalogue_voucher_to_guest_order(
  p_order_id uuid,
  p_voucher_id uuid,
  p_actor_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  order_row public.orders;
  voucher_row public.library_vouchers;
  v_today date;
  v_order_date date;
  v_pickup date;
  v_subtotal numeric(10, 2);
  v_amount numeric(10, 2);
  v_adjustment_id uuid;
  v_has_cake boolean := false;
  v_has_size boolean := false;
  v_line_ok boolean := true;
  v_order_type text;
  r_order public.library_voucher_rules;
  r_fulfil public.library_voucher_rules;
  r_min public.library_voucher_rules;
  c_code constant text := 'catalogue_voucher';
begin
  if p_order_id is null or p_voucher_id is null then
    raise exception 'Order and voucher are required';
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

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot receive adjustments';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_code) then
    raise exception 'A catalogue voucher is already applied to this order';
  end if;
  if public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026') then
    raise exception 'Cannot stack with August Promo on the same order';
  end if;
  if public.guest_order_has_adjustment_code(p_order_id, 'rm10_physical_card') then
    raise exception 'Cannot stack with an RM10 Discount Card on the same order';
  end if;

  select v.*
  into voucher_row
  from public.library_vouchers v
  where v.id = p_voucher_id
  for share;

  if not found then
    raise exception 'Voucher not found';
  end if;
  if voucher_row.status <> 'active' then
    raise exception 'Voucher is not active';
  end if;
  if voucher_row.voucher_type not in ('fixed_amount', 'percentage') then
    raise exception 'This voucher type cannot be applied';
  end if;

  v_today := public.singapore_calendar_date(now());
  if voucher_row.valid_from is not null and v_today < voucher_row.valid_from then
    raise exception 'Voucher is not yet valid';
  end if;
  if voucher_row.valid_until is not null and v_today > voucher_row.valid_until then
    raise exception 'Voucher validity has ended';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;
  v_subtotal := public.order_items_subtotal(p_order_id);
  v_order_type := case
    when order_row.extra_stock_id is not null then 'fresh_pick'
    else 'preorder'
  end;

  select r.* into r_order
  from public.library_voucher_rules r
  where r.voucher_id = voucher_row.id and r.rule_type = 'order_date';
  if found then
    if r_order.date_from is not null and v_order_date < r_order.date_from then
      raise exception 'Order date is outside the voucher window';
    end if;
    if r_order.date_until is not null and v_order_date > r_order.date_until then
      raise exception 'Order date is outside the voucher window';
    end if;
  end if;

  select r.* into r_fulfil
  from public.library_voucher_rules r
  where r.voucher_id = voucher_row.id and r.rule_type = 'fulfilment_date';
  if found then
    if r_fulfil.date_from is not null and v_pickup < r_fulfil.date_from then
      raise exception 'Fulfilment date is outside the voucher window';
    end if;
    if r_fulfil.date_until is not null and v_pickup > r_fulfil.date_until then
      raise exception 'Fulfilment date is outside the voucher window';
    end if;
  end if;

  select r.* into r_min
  from public.library_voucher_rules r
  where r.voucher_id = voucher_row.id and r.rule_type = 'minimum_cake_subtotal';
  if found and r_min.amount is not null then
    if v_subtotal < r_min.amount then
      raise exception 'Cake subtotal is below the voucher minimum';
    end if;
  end if;

  if exists (
    select 1
    from public.library_voucher_rules r
    where r.voucher_id = voucher_row.id and r.rule_type = 'order_type'
  ) then
    if not exists (
      select 1
      from public.library_voucher_rules r
      inner join public.library_voucher_rule_values rv on rv.rule_id = r.id
      where r.voucher_id = voucher_row.id
        and r.rule_type = 'order_type'
        and lower(trim(coalesce(rv.value_code, ''))) = v_order_type
    ) then
      raise exception 'This voucher is not available for this order type';
    end if;
  end if;

  v_has_cake := exists (
    select 1
    from public.library_voucher_rules r
    where r.voucher_id = voucher_row.id and r.rule_type = 'cake'
  );
  v_has_size := exists (
    select 1
    from public.library_voucher_rules r
    where r.voucher_id = voucher_row.id and r.rule_type = 'cake_size'
  );

  if v_has_cake or v_has_size then
    select exists (
      select 1
      from public.order_items oi
      where oi.order_id = p_order_id
        and (
          not v_has_cake
          or exists (
            select 1
            from public.library_voucher_rules r
            inner join public.library_voucher_rule_values rv on rv.rule_id = r.id
            where r.voucher_id = voucher_row.id
              and r.rule_type = 'cake'
              and rv.cake_id = oi.cake_id
          )
        )
        and (
          not v_has_size
          or exists (
            select 1
            from public.library_voucher_rules r
            inner join public.library_voucher_rule_values rv on rv.rule_id = r.id
            where r.voucher_id = voucher_row.id
              and r.rule_type = 'cake_size'
              and (
                (
                  rv.size_label is not null
                  and public.normalize_catalogue_size_label(rv.size_label)
                    = public.normalize_catalogue_size_label(oi.size_label)
                )
                or (rv.cake_size_id is not null and rv.cake_size_id = oi.cake_size_id)
              )
          )
        )
    ) into v_line_ok;
    if v_line_ok is not true then
      raise exception 'No cake line satisfies the voucher cake and size rules';
    end if;
  end if;

  if voucher_row.voucher_type = 'fixed_amount' then
    v_amount := -least(voucher_row.value, v_subtotal);
  else
    v_amount := -round(v_subtotal * voucher_row.value / 100, 2);
  end if;
  if v_amount >= 0 then
    raise exception 'Voucher does not produce a discount';
  end if;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by
  ) values (
    p_order_id,
    'voucher',
    c_code,
    voucher_row.code,
    v_amount,
    'Catalogue voucher applied',
    jsonb_build_object(
      'voucher_id', voucher_row.id,
      'voucher_code', voucher_row.code,
      'voucher_type', voucher_row.voucher_type,
      'value', voucher_row.value,
      'cake_subtotal_at_apply', v_subtotal
    ),
    p_actor_staff_id
  )
  returning id into v_adjustment_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'catalogue_voucher_applied',
    p_actor_staff_id,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'voucher_id', voucher_row.id,
      'voucher_code', voucher_row.code
    )
  );

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'amount', v_amount,
    'amount_due', public.order_amount_due(p_order_id)
  );
end;
$$;

revoke all on function public.apply_catalogue_voucher_to_guest_order(uuid, uuid, uuid) from public;
grant execute on function public.apply_catalogue_voucher_to_guest_order(uuid, uuid, uuid) to authenticated;
