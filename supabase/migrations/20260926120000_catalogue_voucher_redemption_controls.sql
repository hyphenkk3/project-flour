-- Catalogue voucher redemption controls:
-- optional per-voucher limit, atomic reservation, auditable history,
-- one catalogue voucher per order, cancel-release, staff inspection.
-- Does not change RM10, August Promo, or payment-correction behavior.

alter table public.library_vouchers
  add column if not exists redemption_limit integer;

alter table public.library_vouchers
  drop constraint if exists library_vouchers_redemption_limit_positive;

alter table public.library_vouchers
  add constraint library_vouchers_redemption_limit_positive
  check (redemption_limit is null or redemption_limit > 0);

comment on column public.library_vouchers.redemption_limit is
  'Optional maximum active catalogue redemptions. NULL means unlimited.';

create table if not exists public.catalogue_voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.library_vouchers (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  adjustment_id uuid not null references public.order_adjustments (id) on delete restrict,
  discount_amount numeric(10, 2) not null,
  status text not null,
  redeemed_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  released_by uuid references public.staff_profiles (id) on delete set null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  source text not null default 'apply_catalogue_voucher',
  created_at timestamptz not null default now(),
  constraint catalogue_voucher_redemptions_status_check
    check (status in ('redeemed', 'released')),
  constraint catalogue_voucher_redemptions_discount_positive
    check (discount_amount > 0),
  constraint catalogue_voucher_redemptions_release_shape
    check (
      (status = 'redeemed' and released_at is null and release_reason is null)
      or (
        status = 'released'
        and released_at is not null
        and nullif(trim(coalesce(release_reason, '')), '') is not null
      )
    ),
  constraint catalogue_voucher_redemptions_order_voucher_unique
    unique (order_id, voucher_id),
  constraint catalogue_voucher_redemptions_adjustment_unique
    unique (adjustment_id)
);

create unique index if not exists catalogue_voucher_redemptions_one_active_per_order
  on public.catalogue_voucher_redemptions (order_id)
  where status = 'redeemed';

create index if not exists catalogue_voucher_redemptions_voucher_status_idx
  on public.catalogue_voucher_redemptions (voucher_id, status, redeemed_at desc);

create index if not exists catalogue_voucher_redemptions_order_idx
  on public.catalogue_voucher_redemptions (order_id);

comment on table public.catalogue_voucher_redemptions is
  'Authoritative catalogue voucher redemption history. Active count is redeemed rows.';

alter table public.catalogue_voucher_redemptions enable row level security;

revoke all on table public.catalogue_voucher_redemptions from public, anon, authenticated;
grant all on table public.catalogue_voucher_redemptions to service_role;

create or replace function public.catalogue_voucher_active_redemption_count(
  p_voucher_id uuid
)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select count(*)::integer
  from public.catalogue_voucher_redemptions
  where voucher_id = p_voucher_id
    and status = 'redeemed';
$$;

create or replace function public.assert_catalogue_voucher_redemption_available(
  p_voucher_id uuid
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_limit integer;
  v_active integer;
begin
  select lv.redemption_limit
  into v_limit
  from public.library_vouchers lv
  where lv.id = p_voucher_id
  for update;

  if not found then
    raise exception 'Voucher not found';
  end if;

  if v_limit is null then
    return;
  end if;

  v_active := public.catalogue_voucher_active_redemption_count(p_voucher_id);
  if v_active >= v_limit then
    raise exception 'Voucher is no longer available.';
  end if;
end;
$$;

create or replace function public.record_catalogue_voucher_redemption(
  p_voucher_id uuid,
  p_order_id uuid,
  p_adjustment_id uuid,
  p_discount_amount numeric,
  p_actor_staff_id uuid
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if p_discount_amount is null or p_discount_amount <= 0 then
    raise exception 'Voucher does not produce a discount';
  end if;

  insert into public.catalogue_voucher_redemptions (
    voucher_id,
    order_id,
    adjustment_id,
    discount_amount,
    status,
    actor_staff_id,
    source
  ) values (
    p_voucher_id,
    p_order_id,
    p_adjustment_id,
    p_discount_amount,
    'redeemed',
    p_actor_staff_id,
    'apply_catalogue_voucher'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.release_catalogue_voucher_redemptions_for_order(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text
)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_count integer := 0;
begin
  if p_order_id is null then
    return 0;
  end if;
  if v_reason is null then
    v_reason := 'order_cancelled';
  end if;

  update public.catalogue_voucher_redemptions
  set
    status = 'released',
    released_at = now(),
    release_reason = v_reason,
    released_by = p_actor_staff_id
  where order_id = p_order_id
    and status = 'redeemed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.catalogue_voucher_active_redemption_count(uuid) from public, anon, authenticated;
revoke all on function public.assert_catalogue_voucher_redemption_available(uuid) from public, anon, authenticated;
revoke all on function public.record_catalogue_voucher_redemption(uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.release_catalogue_voucher_redemptions_for_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.catalogue_voucher_active_redemption_count(uuid) to service_role;
grant execute on function public.assert_catalogue_voucher_redemption_available(uuid) to service_role;
grant execute on function public.record_catalogue_voucher_redemption(uuid, uuid, uuid, numeric, uuid) to service_role;
grant execute on function public.release_catalogue_voucher_redemptions_for_order(uuid, uuid, text) to service_role;

create or replace function public.trg_release_catalogue_voucher_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.release_catalogue_voucher_redemptions_for_order(
      new.id,
      new.updated_by,
      'order_cancelled'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_release_catalogue_voucher_on_cancel on public.orders;
create trigger orders_release_catalogue_voucher_on_cancel
after update of status on public.orders
for each row
when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
execute function public.trg_release_catalogue_voucher_on_order_cancel();

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
        and (
          lv.redemption_limit is null
          or public.catalogue_voucher_active_redemption_count(lv.id) < lv.redemption_limit
        )
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
  for update;

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

  perform public.assert_catalogue_voucher_redemption_available(voucher_row.id);

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

  perform public.record_catalogue_voucher_redemption(
    voucher_row.id,
    p_order_id,
    v_adjustment_id,
    abs(v_amount),
    p_actor_staff_id
  );

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

create or replace function public.get_catalogue_voucher_redemption_summaries()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if public._current_staff_role_code() is distinct from 'owner'
    and public._current_staff_role_code() is distinct from 'manager'
  then
    raise exception 'Not authorized to inspect catalogue voucher redemptions';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'voucher_id', lv.id,
      'redemption_limit', lv.redemption_limit,
      'active', coalesce(s.active_count, 0),
      'released', coalesce(s.released_count, 0),
      'remaining', case
        when lv.redemption_limit is null then null
        else greatest(lv.redemption_limit - coalesce(s.active_count, 0), 0)
      end
    ) order by lv.code)
    from public.library_vouchers lv
    left join (
      select
        voucher_id,
        count(*) filter (where status = 'redeemed')::integer as active_count,
        count(*) filter (where status = 'released')::integer as released_count
      from public.catalogue_voucher_redemptions
      group by voucher_id
    ) s on s.voucher_id = lv.id
    where lv.voucher_type in ('fixed_amount', 'percentage')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_catalogue_voucher_redemption_summaries() from public, anon;
grant execute on function public.get_catalogue_voucher_redemption_summaries() to authenticated;

create or replace function public.list_catalogue_voucher_redemption_events(
  p_voucher_id uuid,
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if public._current_staff_role_code() is distinct from 'owner'
    and public._current_staff_role_code() is distinct from 'manager'
  then
    raise exception 'Not authorized to inspect catalogue voucher redemptions';
  end if;
  if p_voucher_id is null then
    raise exception 'Voucher is required';
  end if;
  if v_status not in ('all', 'redeemed', 'released') then
    raise exception 'Invalid redemption history filter';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(e)::jsonb order by e.occurred_at desc, e.event)
    from (
      select *
      from (
        select
          r.id as redemption_id,
          r.voucher_id,
          r.order_id,
          o.order_number,
          o.guest_name,
          'redeemed'::text as event,
          r.discount_amount,
          r.status,
          r.redeemed_at as occurred_at,
          null::text as release_reason,
          r.actor_staff_id
        from public.catalogue_voucher_redemptions r
        inner join public.orders o on o.id = r.order_id
        where r.voucher_id = p_voucher_id
        union all
        select
          r.id,
          r.voucher_id,
          r.order_id,
          o.order_number,
          o.guest_name,
          'released',
          r.discount_amount,
          r.status,
          r.released_at,
          r.release_reason,
          r.released_by
        from public.catalogue_voucher_redemptions r
        inner join public.orders o on o.id = r.order_id
        where r.voucher_id = p_voucher_id
          and r.status = 'released'
          and r.released_at is not null
      ) events
      where v_status = 'all' or events.event = v_status
      order by events.occurred_at desc, events.event
      limit v_limit
      offset v_offset
    ) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_catalogue_voucher_redemption_events(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_catalogue_voucher_redemption_events(uuid, text, integer, integer)
  to authenticated;
