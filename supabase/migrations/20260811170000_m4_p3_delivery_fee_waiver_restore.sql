-- M4-P3 Slice 2A completion — explicit audited Owner waiver restoration.
-- Additive only: no Slice 1 schema redesign.
-- Restores must not be simulated via set-quote / override.

create or replace function public.restore_guest_order_processing_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_method public.fulfilment_method;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
  v_restored numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can restore Processing fee';
  end if;

  select fulfilment_method into v_method
  from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_method is distinct from 'delivery' then
    raise exception 'Processing fee restore applies only to Delivery orders';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if not v_details.processing_fee_waived then
    raise exception 'Processing fee is not waived';
  end if;

  v_restored := coalesce(
    v_details.processing_fee_override_amount,
    v_details.processing_fee_applicable_amount,
    0
  )::numeric(10, 2);

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_waived = false,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_restored',
    p_actor_staff_id,
    jsonb_build_object(
      'applicable_amount', v_details.processing_fee_applicable_amount,
      'override_amount', v_details.processing_fee_override_amount,
      'restored_effective_amount', v_restored,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amount_due', v_after,
    'restored_effective_amount', v_restored
  );
end;
$$;

create or replace function public.restore_guest_order_delivery_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_method public.fulfilment_method;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
  v_restored numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can restore Delivery fee';
  end if;

  select fulfilment_method into v_method
  from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_method is distinct from 'delivery' then
    raise exception 'Delivery fee restore applies only to Delivery orders';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.delivery_fee_status is distinct from 'quoted_waived'
     or not v_details.delivery_fee_waived then
    raise exception 'Delivery fee is not waived';
  end if;
  if v_details.delivery_fee_quoted_amount is null
     or v_details.delivery_fee_quoted_amount <= 0 then
    raise exception 'Quoted Delivery fee is required to restore';
  end if;

  v_restored := v_details.delivery_fee_quoted_amount::numeric(10, 2);
  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted',
    delivery_fee_waived = false,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_restored',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_details.delivery_fee_quoted_amount,
      'restored_effective_amount', v_restored,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amount_due', v_after,
    'restored_effective_amount', v_restored
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'restore_guest_order_processing_fee(uuid,uuid,text)',
    'restore_guest_order_delivery_fee(uuid,uuid,text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

comment on function public.restore_guest_order_processing_fee(uuid, uuid, text) is
  'M4-P3 Owner: clear processing_fee_waived and restore effective payable from persisted applicable/override. Explicit audited restore — not an override.';
comment on function public.restore_guest_order_delivery_fee(uuid, uuid, text) is
  'M4-P3 Owner: restore quoted Delivery fee from quoted_waived. Explicit audited restore — not a new quote.';
