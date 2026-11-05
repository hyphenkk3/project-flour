-- Reconcile order payment lifecycle only through an actor-bound RPC.
-- The direct orders payment mutation trigger remains enabled and unchanged.

create or replace function public.reconcile_guest_order_payment_lifecycle(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_order public.orders;
  v_amount_due numeric(10, 2);
  v_net_received numeric(10, 2);
  v_next_status public.order_status;
  v_next_payment_status public.payment_status;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'customer_operations']::text[],
    'Not authorized to reconcile payment lifecycle'
  );

  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Guest order not found';
  end if;

  v_amount_due := public.order_amount_due(p_order_id);
  v_net_received := public.order_net_received(p_order_id);

  -- Preserve fulfilment states for orders that have not entered payment
  -- lifecycle. Existing paid/awaiting_payment orders remain reconciled after
  -- financial changes even when the net received amount is zero.
  if v_order.status not in ('paid', 'awaiting_payment')
     and v_net_received <= 0 then
    return jsonb_build_object(
      'outcome', 'not_applicable',
      'order_status', v_order.status::text,
      'payment_status', v_order.payment_status::text
    );
  end if;

  if v_net_received >= v_amount_due then
    v_next_status := 'paid'::public.order_status;
    v_next_payment_status := 'paid'::public.payment_status;
  else
    v_next_status := 'awaiting_payment'::public.order_status;
    v_next_payment_status := 'unpaid'::public.payment_status;
  end if;

  if v_order.status is distinct from v_next_status
     or v_order.payment_status is distinct from v_next_payment_status then
    update public.orders o
    set
      status = v_next_status,
      payment_status = v_next_payment_status,
      updated_by = v_actor,
      updated_at = now()
    where o.id = p_order_id;

    return jsonb_build_object(
      'outcome', 'reconciled',
      'order_status', v_next_status::text,
      'payment_status', v_next_payment_status::text
    );
  end if;

  return jsonb_build_object(
    'outcome', 'unchanged',
    'order_status', v_order.status::text,
    'payment_status', v_order.payment_status::text
  );
end;
$function$;

revoke all on function public.reconcile_guest_order_payment_lifecycle(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_guest_order_payment_lifecycle(uuid, uuid)
  to authenticated;

comment on function public.reconcile_guest_order_payment_lifecycle(uuid, uuid) is
  'Actor-bound reconciliation of guest-order payment status after an authorized financial change. Does not create or alter payment rows.';
