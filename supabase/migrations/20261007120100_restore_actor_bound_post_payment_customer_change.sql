-- Restore the final Production actor-bound post-payment customer-change guard.
-- DEV missed the original guard migration; its later actor-binding migration
-- therefore skipped the wrapper. Do not replay the historical migration.
-- Existing exact Production definitions are a verified no-op. Any partial or
-- divergent installation fails closed for review.

do $migration$
declare
  v_impl_oid oid := to_regprocedure(
    'public._guard_post_payment_customer_change_impl(uuid, uuid, boolean)'
  );
  v_wrapper_oid oid := to_regprocedure(
    'public.guard_post_payment_customer_change(uuid, uuid, boolean)'
  );
begin
  if v_impl_oid is not null or v_wrapper_oid is not null then
    if v_impl_oid is null or v_wrapper_oid is null then
      raise exception 'Post-payment customer-change guard is partially installed';
    end if;
    if md5(pg_get_functiondef(v_impl_oid)) is distinct from 'b3664b493ea538c6b1377dab2a02f1d0'
      or md5(pg_get_functiondef(v_wrapper_oid)) is distinct from '08232ed19d748c02dcf4ba6ac5380442'
    then
      raise exception 'Post-payment customer-change guard differs from approved Production definitions';
    end if;
  else

  execute $definition$
CREATE OR REPLACE FUNCTION public._guard_post_payment_customer_change_impl(p_order_id uuid, p_actor_staff_id uuid, p_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_row public.orders;
  v_role text;
  v_now timestamptz := now();
  v_outcome text;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null
    or v_role not in ('owner', 'manager', 'customer_operations')
  then
    raise exception 'Not authorized to change this order';
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

  if order_row.status is distinct from 'paid' then
    return jsonb_build_object(
      'outcome', 'not_applicable',
      'count', coalesce(order_row.post_payment_customer_change_count, 0)
    );
  end if;

  if p_override then
    if v_role not in ('owner', 'manager') then
      raise exception
        'Only Manager or Owner can override the one-time post-payment customer change restriction.';
    end if;

    update public.orders o
    set
      post_payment_customer_change_count =
        case
          when coalesce(o.post_payment_customer_change_count, 0) = 0 then 1
          else o.post_payment_customer_change_count
        end,
      post_payment_customer_change_used_at =
        coalesce(o.post_payment_customer_change_used_at, v_now),
      post_payment_change_override_at = v_now,
      post_payment_change_override_by = p_actor_staff_id,
      updated_by = p_actor_staff_id,
      updated_at = v_now
    where o.id = p_order_id
    returning * into order_row;

    insert into public.order_timeline_events (
      order_id,
      event_type,
      actor_staff_id,
      metadata
    )
    values (
      p_order_id,
      'post_payment_customer_change_override',
      p_actor_staff_id,
      jsonb_build_object(
        'count', order_row.post_payment_customer_change_count,
        'intent', 'amend'
      )
    );

    v_outcome := 'overridden';
  else
    if coalesce(order_row.post_payment_customer_change_count, 0) >= 1 then
      raise exception
        'The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.';
    end if;

    update public.orders o
    set
      post_payment_customer_change_count = 1,
      post_payment_customer_change_used_at = v_now,
      updated_by = p_actor_staff_id,
      updated_at = v_now
    where o.id = p_order_id
      and coalesce(o.post_payment_customer_change_count, 0) = 0
    returning * into order_row;

    if not found then
      raise exception
        'The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.';
    end if;

    insert into public.order_timeline_events (
      order_id,
      event_type,
      actor_staff_id,
      metadata
    )
    values (
      p_order_id,
      'post_payment_customer_change',
      p_actor_staff_id,
      jsonb_build_object('count', 1, 'intent', 'amend')
    );

    v_outcome := 'consumed';
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'count', coalesce(order_row.post_payment_customer_change_count, 0),
    'used_at', order_row.post_payment_customer_change_used_at,
    'override_at', order_row.post_payment_change_override_at
  );
end;
$function$;
$definition$;

  execute $definition$
CREATE OR REPLACE FUNCTION public.guard_post_payment_customer_change(p_order_id uuid, p_actor_staff_id uuid, p_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    declare
      v_actor uuid;
    begin
      v_actor := public._bind_rpc_actor(p_actor_staff_id);
      return public._guard_post_payment_customer_change_impl(
        p_order_id,
        v_actor,
        p_override
      );
    end;
    $function$;
$definition$;

  execute $statement$
    alter function public._guard_post_payment_customer_change_impl(uuid, uuid, boolean)
      owner to postgres
  $statement$;
  execute $statement$
    alter function public.guard_post_payment_customer_change(uuid, uuid, boolean)
      owner to postgres
  $statement$;

  execute $statement$
    comment on function public._guard_post_payment_customer_change_impl(uuid, uuid, boolean) is
      'Lock a paid guest order and consume or override the one-time post-payment customer change. Unpaid orders are a no-op. Concurrent first changes cannot both succeed.'
  $statement$;

  -- Match live Production's effective privileges. The public wrapper binds
  -- the supplied actor to auth.uid() before the private implementation runs;
  -- anonymous calls fail inside _bind_rpc_actor. The implementation itself
  -- remains inaccessible to anonymous and authenticated roles.
  execute $statement$
    revoke all on function public._guard_post_payment_customer_change_impl(uuid, uuid, boolean)
      from public, anon, authenticated
  $statement$;
  execute $statement$
    grant execute on function public._guard_post_payment_customer_change_impl(uuid, uuid, boolean)
      to service_role
  $statement$;
  execute $statement$
    revoke all on function public.guard_post_payment_customer_change(uuid, uuid, boolean)
      from public, anon, authenticated, service_role
  $statement$;
  execute $statement$
    grant execute on function public.guard_post_payment_customer_change(uuid, uuid, boolean)
      to public, anon, authenticated, service_role
  $statement$;
  end if;
end;
$migration$;
