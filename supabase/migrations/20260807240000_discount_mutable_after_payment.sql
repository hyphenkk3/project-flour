-- Preview 2 correction: discounts remain mutable after payment received.
-- Compensating adjustments only. Verified payments stay immutable.
-- Additive. Does not edit previously applied migrations.

create or replace function public.apply_august_promo_to_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_subtotal numeric(10, 2);
  v_order_date date;
  v_pickup date;
  v_adjustment_id uuid;
  v_amount_due numeric(10, 2);
  c_code constant text := 'august_promo_2026';
  c_label constant text := 'August Promo';
  c_amount constant numeric(10, 2) := -20.00;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
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

  -- Payment does not freeze discounts. Verified payments remain immutable.
  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot receive adjustments';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_code) then
    raise exception 'August Promo is already applied to this order';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, 'rm10_physical_card') then
    raise exception 'August Promo cannot be stacked with an RM10 Discount Card on the same order';
  end if;

  if order_row.order_source <> 'customer_website' then
    raise exception 'August Promo is only eligible for online preorder (customer website)';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;

  if v_order_date < date '2026-07-27' or v_order_date > date '2026-08-08' then
    raise exception 'Order date is outside the August Promo order period (27/07/2026–08/08/2026)';
  end if;

  if v_pickup < date '2026-08-01' or v_pickup > date '2026-08-31' then
    raise exception 'Pickup date must be within August 2026 for August Promo';
  end if;

  v_subtotal := public.order_items_subtotal(p_order_id);
  if v_subtotal <= 100 then
    raise exception 'August Promo requires whole-cake subtotal above RM100';
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
    'promotion',
    c_code,
    c_label,
    c_amount,
    'August Promo applied',
    jsonb_build_object(
      'promotion', 'august_promo_2026',
      'discount_rm', 20,
      'order_date', v_order_date,
      'pickup_date', v_pickup,
      'subtotal_at_apply', v_subtotal
    ),
    p_actor_staff_id
  )
  returning id into v_adjustment_id;

  update public.orders o
  set
    rm10_card_issuance_suppressed = true,
    rm10_card_issuance_suppression_code = 'august_promo_applied',
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'august_promo_applied',
    p_actor_staff_id,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'amount', c_amount,
      'code', c_code
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'amount_due', v_amount_due,
    'code', c_code
  );
exception
  when unique_violation then
    raise exception 'August Promo is already applied to this order';
end;
$$;

revoke all on function public.apply_august_promo_to_guest_order(uuid, uuid) from public;
grant execute on function public.apply_august_promo_to_guest_order(uuid, uuid) to authenticated;

create or replace function public.redeem_rm10_physical_voucher_for_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_voucher_number text,
  p_expiry_date date,
  p_owner_override boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  voucher_row public.physical_discount_vouchers;
  v_number text;
  v_normalized text;
  v_order_date date;
  v_pickup date;
  v_valid boolean := true;
  v_invalid_reason text := null;
  v_role_code text;
  v_adjustment_id uuid;
  v_redemption_id uuid;
  v_amount_due numeric(10, 2);
  c_code constant text := 'rm10_physical_card';
  c_label constant text := 'RM10 Discount Card';
  c_amount constant numeric(10, 2) := -10.00;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_number := nullif(trim(coalesce(p_voucher_number, '')), '');
  if v_number is null then
    raise exception 'Voucher number is required';
  end if;
  if p_expiry_date is null then
    raise exception 'Voucher expiry date is required';
  end if;

  v_normalized := public.normalize_physical_voucher_number(v_number);
  if v_normalized is null or v_normalized = '' then
    raise exception 'Voucher number is required';
  end if;

  select r.code
  into v_role_code
  from public.staff_profiles sp
  inner join public.roles r on r.id = sp.role_id
  where sp.id = p_actor_staff_id;

  if v_role_code is distinct from 'owner' then
    raise exception 'Only Owner can redeem physical discount vouchers in this workspace';
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

  -- Payment does not freeze discounts. Verified payments remain immutable.
  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot receive adjustments';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_code) then
    raise exception 'An RM10 Discount Card is already applied to this order';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026') then
    raise exception 'RM10 Discount Card cannot be stacked with August Promo on the same order';
  end if;

  if not public.guest_order_has_eligible_rm10_size(p_order_id) then
    raise exception 'RM10 Discount Card requires a 6" or 8" cake on the order';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;

  if v_order_date > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Order date is after voucher expiry';
  elsif v_pickup > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Pickup date is after voucher expiry';
  end if;

  if not v_valid then
    if coalesce(p_owner_override, false) = false then
      raise exception '%', v_invalid_reason;
    end if;
    if nullif(trim(coalesce(p_override_reason, '')), '') is null then
      raise exception 'Owner override requires a reason';
    end if;
  elsif coalesce(p_owner_override, false) then
    raise exception 'Owner override is only allowed when the voucher is otherwise invalid';
  end if;

  select v.*
  into voucher_row
  from public.physical_discount_vouchers v
  where v.voucher_number_normalized = v_normalized
  for update;

  if found then
    if voucher_row.status = 'redeemed' then
      raise exception 'This voucher number has already been redeemed';
    end if;
    update public.physical_discount_vouchers v
    set
      expiry_date = p_expiry_date,
      voucher_number = v_number,
      updated_at = now()
    where v.id = voucher_row.id
    returning * into voucher_row;
  else
    insert into public.physical_discount_vouchers (
      voucher_number,
      voucher_number_normalized,
      expiry_date,
      status
    ) values (
      v_number,
      v_normalized,
      p_expiry_date,
      'unredeemed'
    )
    returning * into voucher_row;
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
    c_label,
    c_amount,
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else 'RM10 physical discount card redeemed'
    end,
    jsonb_build_object(
      'voucher_number', v_number,
      'expiry_date', p_expiry_date,
      'owner_override', coalesce(p_owner_override, false)
    ),
    p_actor_staff_id
  )
  returning id into v_adjustment_id;

  insert into public.physical_discount_voucher_redemptions (
    voucher_id,
    order_id,
    adjustment_id,
    voucher_number,
    expiry_date,
    verified_by,
    is_owner_override,
    override_reason
  ) values (
    voucher_row.id,
    p_order_id,
    v_adjustment_id,
    v_number,
    p_expiry_date,
    p_actor_staff_id,
    coalesce(p_owner_override, false),
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else null
    end
  )
  returning id into v_redemption_id;

  update public.order_adjustments oa
  set
    reference_type = 'physical_discount_voucher_redemption',
    reference_id = v_redemption_id
  where oa.id = v_adjustment_id;

  update public.physical_discount_vouchers v
  set
    status = 'redeemed',
    updated_at = now()
  where v.id = voucher_row.id;

  update public.orders o
  set
    rm10_card_issuance_suppressed = true,
    rm10_card_issuance_suppression_code = 'rm10_voucher_redeemed',
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    case
      when coalesce(p_owner_override, false) then 'rm10_voucher_owner_override'
      else 'rm10_voucher_redeemed'
    end,
    p_actor_staff_id,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'redemption_id', v_redemption_id,
      'voucher_number', v_number,
      'expiry_date', p_expiry_date,
      'owner_override', coalesce(p_owner_override, false),
      'override_reason', nullif(trim(coalesce(p_override_reason, '')), ''),
      'invalid_reason', v_invalid_reason
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'redemption_id', v_redemption_id,
    'amount_due', v_amount_due,
    'owner_override', coalesce(p_owner_override, false)
  );
exception
  when unique_violation then
    raise exception 'This voucher cannot be redeemed again (duplicate protection)';
end;
$$;

revoke all on function public.redeem_rm10_physical_voucher_for_guest_order(
  uuid, uuid, text, date, boolean, text
) from public;
grant execute on function public.redeem_rm10_physical_voucher_for_guest_order(
  uuid, uuid, text, date, boolean, text
) to authenticated;

create or replace function public.reverse_active_guest_order_adjustment(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_adjustment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  original public.order_adjustments;
  v_reversal_id uuid;
  v_amount_due numeric(10, 2);
  v_reversal_label text;
begin
  if p_order_id is null or p_actor_staff_id is null or p_adjustment_id is null then
    raise exception 'Order, staff actor, and adjustment are required';
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

  -- Payment does not freeze discount Change/Remove. Use compensating adjustments.
  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot change discounts';
  end if;

  select oa.*
  into original
  from public.order_adjustments oa
  where oa.id = p_adjustment_id
    and oa.order_id = p_order_id
  for update;

  if not found then
    raise exception 'Adjustment not found on this order';
  end if;

  if original.reverses_adjustment_id is not null then
    raise exception 'Cannot reverse a reversal adjustment';
  end if;

  if original.status <> 'active' then
    raise exception 'This discount is no longer active';
  end if;

  if original.code is null or original.code not in ('august_promo_2026', 'rm10_physical_card') then
    raise exception 'This adjustment cannot be removed in this Preview';
  end if;

  v_reversal_label := original.label || ' reversal';

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by,
    status,
    reverses_adjustment_id
  ) values (
    p_order_id,
    'reversal',
    null,
    v_reversal_label,
    -original.amount,
    'Discount removed',
    jsonb_build_object(
      'reverses_adjustment_id', original.id,
      'reversed_code', original.code,
      'reversed_label', original.label,
      'reversed_amount', original.amount
    ),
    p_actor_staff_id,
    'active',
    original.id
  )
  returning id into v_reversal_id;

  -- Lifecycle only — financial amount on original is unchanged
  update public.order_adjustments oa
  set status = 'reversed'
  where oa.id = original.id;

  perform public.refresh_guest_order_rm10_issuance_suppression(
    p_order_id,
    p_actor_staff_id
  );

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'discount_removed',
    p_actor_staff_id,
    jsonb_build_object(
      'original_adjustment_id', original.id,
      'reversal_adjustment_id', v_reversal_id,
      'code', original.code,
      'label', original.label,
      'reversed_amount', original.amount,
      'compensating_amount', -original.amount
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'original_adjustment_id', original.id,
    'reversal_adjustment_id', v_reversal_id,
    'amount_due', v_amount_due
  );
end;
$$;

revoke all on function public.reverse_active_guest_order_adjustment(uuid, uuid, uuid)
  from public;
grant execute on function public.reverse_active_guest_order_adjustment(uuid, uuid, uuid)
  to authenticated;

create or replace function public.change_august_promo_to_rm10_physical_voucher(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_voucher_number text,
  p_expiry_date date,
  p_owner_override boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  promo_row public.order_adjustments;
  voucher_row public.physical_discount_vouchers;
  v_number text;
  v_normalized text;
  v_order_date date;
  v_pickup date;
  v_valid boolean := true;
  v_invalid_reason text := null;
  v_role_code text;
  v_reversal_id uuid;
  v_adjustment_id uuid;
  v_redemption_id uuid;
  v_amount_due numeric(10, 2);
  c_promo constant text := 'august_promo_2026';
  c_card constant text := 'rm10_physical_card';
  c_label constant text := 'RM10 Discount Card';
  c_amount constant numeric(10, 2) := -10.00;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_number := nullif(trim(coalesce(p_voucher_number, '')), '');
  if v_number is null then
    raise exception 'Voucher number is required';
  end if;
  if p_expiry_date is null then
    raise exception 'Voucher expiry date is required';
  end if;

  v_normalized := public.normalize_physical_voucher_number(v_number);

  select r.code
  into v_role_code
  from public.staff_profiles sp
  inner join public.roles r on r.id = sp.role_id
  where sp.id = p_actor_staff_id;

  if v_role_code is distinct from 'owner' then
    raise exception 'Only Owner can change discounts to a physical voucher in this workspace';
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

  -- Payment does not freeze discount Change/Remove. Use compensating adjustments.
  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot change discounts';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_card) then
    raise exception 'An RM10 Discount Card is already applied to this order';
  end if;

  select oa.*
  into promo_row
  from public.order_adjustments oa
  where oa.order_id = p_order_id
    and oa.code = c_promo
    and oa.status = 'active'
    and oa.reverses_adjustment_id is null
  for update;

  if not found then
    raise exception 'August Promo is not currently active on this order';
  end if;

  if not public.guest_order_has_eligible_rm10_size(p_order_id) then
    raise exception 'RM10 Discount Card requires a 6" or 8" cake on the order';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;

  if v_order_date > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Order date is after voucher expiry';
  elsif v_pickup > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Pickup date is after voucher expiry';
  end if;

  if not v_valid then
    if coalesce(p_owner_override, false) = false then
      raise exception '%', v_invalid_reason;
    end if;
    if nullif(trim(coalesce(p_override_reason, '')), '') is null then
      raise exception 'Owner override requires a reason';
    end if;
  elsif coalesce(p_owner_override, false) then
    raise exception 'Owner override is only allowed when the voucher is otherwise invalid';
  end if;

  -- Lock / prepare voucher BEFORE mutating promo (fail early)
  select v.*
  into voucher_row
  from public.physical_discount_vouchers v
  where v.voucher_number_normalized = v_normalized
  for update;

  if found then
    if voucher_row.status = 'redeemed' then
      raise exception 'This voucher number has already been redeemed';
    end if;
    update public.physical_discount_vouchers v
    set
      expiry_date = p_expiry_date,
      voucher_number = v_number,
      updated_at = now()
    where v.id = voucher_row.id
    returning * into voucher_row;
  else
    insert into public.physical_discount_vouchers (
      voucher_number,
      voucher_number_normalized,
      expiry_date,
      status
    ) values (
      v_number,
      v_normalized,
      p_expiry_date,
      'unredeemed'
    )
    returning * into voucher_row;
  end if;

  -- Compensating reversal of August Promo
  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by,
    status,
    reverses_adjustment_id
  ) values (
    p_order_id,
    'reversal',
    null,
    promo_row.label || ' reversal',
    -promo_row.amount,
    'Discount changed to RM10 Discount Card',
    jsonb_build_object(
      'reverses_adjustment_id', promo_row.id,
      'reversed_code', promo_row.code,
      'change_to', c_card
    ),
    p_actor_staff_id,
    'active',
    promo_row.id
  )
  returning id into v_reversal_id;

  update public.order_adjustments oa
  set status = 'reversed'
  where oa.id = promo_row.id;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by,
    status
  ) values (
    p_order_id,
    'voucher',
    c_card,
    c_label,
    c_amount,
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else 'RM10 physical discount card redeemed (changed from August Promo)'
    end,
    jsonb_build_object(
      'voucher_number', v_number,
      'expiry_date', p_expiry_date,
      'owner_override', coalesce(p_owner_override, false),
      'replaced_adjustment_id', promo_row.id
    ),
    p_actor_staff_id,
    'active'
  )
  returning id into v_adjustment_id;

  insert into public.physical_discount_voucher_redemptions (
    voucher_id,
    order_id,
    adjustment_id,
    voucher_number,
    expiry_date,
    verified_by,
    is_owner_override,
    override_reason
  ) values (
    voucher_row.id,
    p_order_id,
    v_adjustment_id,
    v_number,
    p_expiry_date,
    p_actor_staff_id,
    coalesce(p_owner_override, false),
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else null
    end
  )
  returning id into v_redemption_id;

  update public.order_adjustments oa
  set
    reference_type = 'physical_discount_voucher_redemption',
    reference_id = v_redemption_id
  where oa.id = v_adjustment_id;

  update public.physical_discount_vouchers v
  set
    status = 'redeemed',
    updated_at = now()
  where v.id = voucher_row.id;

  perform public.refresh_guest_order_rm10_issuance_suppression(
    p_order_id,
    p_actor_staff_id
  );

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'discount_changed',
    p_actor_staff_id,
    jsonb_build_object(
      'from_code', c_promo,
      'to_code', c_card,
      'original_adjustment_id', promo_row.id,
      'reversal_adjustment_id', v_reversal_id,
      'new_adjustment_id', v_adjustment_id,
      'redemption_id', v_redemption_id,
      'voucher_number', v_number,
      'owner_override', coalesce(p_owner_override, false)
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'amount_due', v_amount_due,
    'reversal_adjustment_id', v_reversal_id,
    'adjustment_id', v_adjustment_id,
    'redemption_id', v_redemption_id
  );
exception
  when unique_violation then
    raise exception 'This voucher cannot be redeemed again (duplicate protection)';
end;
$$;

revoke all on function public.change_august_promo_to_rm10_physical_voucher(
  uuid, uuid, text, date, boolean, text
) from public;
grant execute on function public.change_august_promo_to_rm10_physical_voucher(
  uuid, uuid, text, date, boolean, text
) to authenticated;

comment on function public.reverse_active_guest_order_adjustment(uuid, uuid, uuid) is
  'Remove active discount via compensating reversal. Allowed through paid; does not mutate payments.';

comment on function public.change_august_promo_to_rm10_physical_voucher(uuid, uuid, text, date, boolean, text) is
  'Atomic August Promo → RM10 change via compensating adjustments. Allowed through paid; does not mutate payments.';
