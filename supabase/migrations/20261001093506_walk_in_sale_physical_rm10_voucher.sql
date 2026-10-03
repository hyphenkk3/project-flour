begin;

drop function if exists public.complete_extra_stock_walk_in_sale(uuid, uuid, text, text, uuid);

create or replace function public.complete_extra_stock_walk_in_sale(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_payment_method text,
  p_payment_method_description text default null,
  p_catalogue_voucher_id uuid default null,
  p_physical_rm10_voucher_number text default null,
  p_physical_rm10_expiry_date date default null,
  p_rm10_owner_override boolean default false,
  p_rm10_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  stock_row public.extra_stock;
  size_row public.library_cake_sizes;
  new_order public.orders;
  v_pickup_date date;
  v_pickup_time time;
  v_price numeric(10, 2);
  v_updated int;
  v_method text;
  v_method_description text;
  v_remaining numeric(10, 2);
  v_payment jsonb;
  v_physical_rm10_voucher_number text;
  v_rm10_override_reason text;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'customer_operations']::text[],
    'Not authorized to complete a walk-in sale'
  );

  v_method := nullif(trim(coalesce(p_payment_method, '')), '');
  if v_method is null or v_method not in ('wb_qr', 'online_transfer', 'others') then
    raise exception 'Choose a payment method.';
  end if;
  v_method_description := nullif(trim(coalesce(p_payment_method_description, '')), '');
  if v_method = 'others' and v_method_description is null then
    raise exception 'Description is required when payment method is Others';
  end if;
  if v_method <> 'others' then
    v_method_description := null;
  end if;

  v_physical_rm10_voucher_number := nullif(
    trim(coalesce(p_physical_rm10_voucher_number, '')),
    ''
  );
  v_rm10_override_reason := nullif(trim(coalesce(p_rm10_override_reason, '')), '');
  if v_physical_rm10_voucher_number is null then
    if p_physical_rm10_expiry_date is not null
       or coalesce(p_rm10_owner_override, false)
       or v_rm10_override_reason is not null then
      raise exception 'Physical RM10 voucher number is required';
    end if;
  else
    if p_physical_rm10_expiry_date is null then
      raise exception 'Voucher expiry date is required';
    end if;
    if coalesce(p_rm10_owner_override, false)
       and v_rm10_override_reason is null then
      raise exception 'Owner override requires a reason';
    end if;
    if not coalesce(p_rm10_owner_override, false)
       and v_rm10_override_reason is not null then
      raise exception 'Override reason requires an Owner/Manager override';
    end if;
    if p_catalogue_voucher_id is not null then
      raise exception 'Cannot stack with an RM10 Discount Card on the same order';
    end if;
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be sold';
  end if;
  if stock_row.sold_at is not null or stock_row.order_id is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;
  if stock_row.library_cake_id is null or stock_row.library_cake_size_id is null then
    raise exception 'This Extra cake cannot be ordered';
  end if;
  if not public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until) then
    raise exception 'Sold is only available from an active Walk-in Hold.';
  end if;

  select lcs.*
  into size_row
  from public.library_cake_sizes lcs
  where lcs.id = stock_row.library_cake_size_id
    and lcs.cake_id = stock_row.library_cake_id;
  if not found then
    raise exception 'This Extra cake cannot be ordered';
  end if;

  v_pickup_date := public.extra_walk_in_sale_pickup_date(
    stock_row.prepared_on,
    stock_row.pickup_available_from_at,
    stock_row.pickup_through_at,
    now()
  );
  v_pickup_time := (timezone('Asia/Singapore', now()))::time;
  v_price := public.library_cake_size_price_on(
    stock_row.library_cake_size_id,
    v_pickup_date
  );

  perform public._clear_extra_walk_in_hold(p_extra_stock_id);

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.lifecycle = 'confirmed'
    and e.cut_into_slices_at is null
    and e.order_id is null
    and (e.walk_in_held_until is null or e.walk_in_held_until < now());
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    status,
    payment_status,
    customer_notes,
    collection_id,
    extra_stock_id,
    confirmation_needs_resend,
    order_source,
    email_submission_receipt_requested,
    include_receipt,
    created_by,
    updated_by
  )
  values (
    public.allocate_order_number(),
    null,
    'WALK-IN',
    null,
    null,
    'pickup'::public.fulfilment_method,
    v_pickup_date,
    v_pickup_time,
    'awaiting_payment',
    'unpaid',
    null,
    null,
    p_extra_stock_id,
    false,
    'walk_in',
    false,
    false,
    v_actor,
    v_actor
  )
  returning * into new_order;

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
    stock_row.library_cake_id,
    stock_row.library_cake_size_id,
    1,
    coalesce(v_price, 0),
    stock_row.cake_name,
    stock_row.size_label
  );

  update public.extra_stock e
  set order_id = new_order.id, updated_at = now()
  where e.id = p_extra_stock_id
    and e.order_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;

  if p_catalogue_voucher_id is not null then
    perform public.apply_catalogue_voucher_to_guest_order(
      new_order.id,
      p_catalogue_voucher_id,
      v_actor
    );
  end if;

  if v_physical_rm10_voucher_number is not null then
    perform public.redeem_rm10_physical_voucher_for_guest_order(
      new_order.id,
      v_actor,
      v_physical_rm10_voucher_number,
      p_physical_rm10_expiry_date,
      coalesce(p_rm10_owner_override, false),
      v_rm10_override_reason
    );
  end if;

  v_remaining := public.order_amount_due(new_order.id);

  if v_remaining > 0 then
    v_payment := public.record_and_verify_guest_order_payment(
      new_order.id,
      v_remaining,
      v_method,
      v_method_description,
      now(),
      null,
      v_actor
    );
  else
    update public.orders o
    set
      status = 'paid',
      payment_status = 'paid',
      updated_by = v_actor,
      updated_at = now()
    where o.id = new_order.id
    returning * into new_order;

    insert into public.order_timeline_events (
      order_id,
      event_type,
      actor_staff_id,
      metadata
    )
    values (
      new_order.id,
      'payment_secured',
      v_actor,
      jsonb_build_object(
        'amount_due', 0,
        'net_received', 0,
        'remaining_balance', 0,
        'order_status', 'paid',
        'method', v_method,
        'walk_in_sale', true
      )
    );

    v_payment := jsonb_build_object(
      'order_id', new_order.id,
      'order_status', 'paid',
      'amount_due', 0,
      'net_received', 0,
      'remaining_balance', 0
    );
  end if;

  return jsonb_build_object(
    'order_id', new_order.id,
    'order_number', new_order.order_number,
    'extra_stock_id', p_extra_stock_id,
    'pickup_date', v_pickup_date,
    'unit_price', coalesce(v_price, 0),
    'amount_due', coalesce((v_payment ->> 'amount_due')::numeric, v_remaining),
    'remaining_balance', coalesce((v_payment ->> 'remaining_balance')::numeric, 0),
    'order_status', coalesce(v_payment ->> 'order_status', 'paid')
  );
end;
$$;

comment on function public.complete_extra_stock_walk_in_sale(uuid, uuid, text, text, uuid, text, date, boolean, text) is
  'Complete an active Fresh Pick Walk-in Hold as a paid walk_in guest Extra order. '
  'Uses existing catalogue and physical RM10 voucher redemption, then records payment in the same transaction.';

revoke all on function public.complete_extra_stock_walk_in_sale(uuid, uuid, text, text, uuid, text, date, boolean, text)
  from public, anon;
grant execute on function public.complete_extra_stock_walk_in_sale(uuid, uuid, text, text, uuid, text, date, boolean, text)
  to authenticated, service_role;

commit;
