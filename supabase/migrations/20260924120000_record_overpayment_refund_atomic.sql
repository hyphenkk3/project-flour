-- Atomic overpayment refund + required timeline event.
-- Additive. Does not edit previously applied migrations.
-- Closes the authenticated refunds insert path so a refund cannot exist
-- without its payment_correction_recorded timeline row.

create or replace function public.record_overpayment_refund(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor_staff_id uuid,
  p_payment_snapshot jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_order public.orders;
  v_amount numeric(10, 2);
  v_reason text;
  v_refund_id uuid;
  v_allocated numeric(10, 2);
  v_due numeric(10, 2);
  v_refunds numeric(10, 2);
  v_remaining numeric(10, 2);
  v_snapshot jsonb;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager']::text[],
    'Only Owner or Manager may record a payment correction.'
  );

  v_amount := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amount <= 0 then
    raise exception 'Enter a valid refund amount.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_snapshot := case
    when jsonb_typeof(coalesce(p_payment_snapshot, '[]'::jsonb)) = 'array'
      then coalesce(p_payment_snapshot, '[]'::jsonb)
    else '[]'::jsonb
  end;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot correct payment on a cancelled order.';
  end if;

  v_allocated := public.order_verified_allocated(p_order_id);
  v_due := public.order_amount_due(p_order_id);
  v_refunds := public.order_refunds_total(p_order_id);
  v_remaining := greatest(v_allocated - v_due - v_refunds, 0)::numeric(10, 2);

  if v_allocated <= 0 then
    raise exception 'This order has no verified payment to correct.';
  end if;
  if v_remaining <= 0 then
    raise exception 'There is no overpayment to refund.';
  end if;
  if v_amount > v_remaining then
    raise exception 'Refund exceeds remaining overpayment';
  end if;

  insert into public.refunds (
    order_id,
    payment_id,
    amount,
    reason,
    created_by,
    status
  ) values (
    p_order_id,
    null,
    v_amount,
    v_reason,
    v_actor,
    'recorded'
  )
  returning id into v_refund_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'payment_correction_recorded',
    v_actor,
    jsonb_build_object(
      'correction_type', 'overpayment_refund',
      'amount', v_amount,
      'reason', v_reason,
      'payment_received', v_allocated,
      'order_amount', v_due,
      'remaining_excess', (v_remaining - v_amount)::numeric(10, 2),
      'payment_snapshot', v_snapshot
    )
  );

  return v_refund_id;
end;
$$;

comment on function public.record_overpayment_refund(
  uuid, numeric, text, uuid, jsonb
) is
  'Owner/Manager overpayment refund and its timeline event in one transaction. '
  'Actor is bound from auth.uid(); service_role may pass an active staff id.';

revoke all on function public.record_overpayment_refund(
  uuid, numeric, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_overpayment_refund(
  uuid, numeric, text, uuid, jsonb
) to authenticated, service_role;

drop policy if exists refunds_authenticated_insert on public.refunds;
