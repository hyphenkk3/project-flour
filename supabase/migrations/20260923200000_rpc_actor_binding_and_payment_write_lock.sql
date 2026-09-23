-- Bind privileged RPC actors to auth.uid() and close authenticated
-- financial writes. Additive. Does not edit previously applied migrations.

-- ---------------------------------------------------------------------------
-- 1) Actor binding helpers
-- ---------------------------------------------------------------------------

create or replace function public._bind_rpc_actor(p_claimed_staff_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_staff_id uuid;
  v_active boolean;
begin
  v_uid := auth.uid();

  if v_uid is null then
    if auth.role() is distinct from 'service_role' then
      raise exception 'Not authenticated';
    end if;
    if p_claimed_staff_id is null then
      raise exception 'Staff actor is required';
    end if;

    select sp.id, sp.is_active
    into v_staff_id, v_active
    from public.staff_profiles sp
    where sp.id = p_claimed_staff_id
      and sp.archived_at is null;

    if v_staff_id is null then
      raise exception 'Staff actor not found';
    end if;
    if v_active is distinct from true then
      raise exception 'Not authorized';
    end if;
    return v_staff_id;
  end if;

  select sp.id
  into v_staff_id
  from public.staff_profiles sp
  where sp.auth_user_id = v_uid
    and sp.is_active is distinct from false
    and sp.archived_at is null;

  if v_staff_id is null then
    raise exception 'Not authorized';
  end if;

  if p_claimed_staff_id is not null
     and p_claimed_staff_id is distinct from v_staff_id then
    raise exception 'Not authorized';
  end if;

  return v_staff_id;
end;
$$;

comment on function public._bind_rpc_actor(uuid) is
  'Resolve the authenticated staff actor from auth.uid(). '
  'Rejects impersonation, inactive/archived staff, and anonymous callers. '
  'service_role may pass an existing active staff id.';

create or replace function public._require_rpc_roles(
  p_staff_id uuid,
  p_roles text[],
  p_message text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public._staff_role_code(p_staff_id);
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception '%', coalesce(nullif(trim(p_message), ''), 'Not authorized');
  end if;
end;
$$;

revoke all on function public._bind_rpc_actor(uuid) from public, anon;
revoke all on function public._require_rpc_roles(uuid, text[], text)
  from public, anon;
grant execute on function public._bind_rpc_actor(uuid)
  to authenticated, service_role;
grant execute on function public._require_rpc_roles(uuid, text[], text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Wrap privileged (uuid, uuid) RPCs: bind actor, then call original impl
-- ---------------------------------------------------------------------------

alter function public.hold_extra_stock_walk_in(uuid, uuid)
  rename to _hold_extra_stock_walk_in_impl;
alter function public.extend_extra_stock_walk_in_hold(uuid, uuid)
  rename to _extend_extra_stock_walk_in_hold_impl;
alter function public.release_extra_stock_walk_in_hold(uuid, uuid)
  rename to _release_extra_stock_walk_in_hold_impl;

alter function public.mark_guest_order_picked_up(uuid, uuid)
  rename to _mark_guest_order_picked_up_impl;
alter function public.undo_guest_order_picked_up(uuid, uuid)
  rename to _undo_guest_order_picked_up_impl;

alter function public.mark_guest_order_ready(uuid, uuid)
  rename to _mark_guest_order_ready_impl;
alter function public.undo_guest_order_ready(uuid, uuid)
  rename to _undo_guest_order_ready_impl;

alter function public.mark_guest_order_production_started(uuid, uuid)
  rename to _mark_guest_order_production_started_impl;
alter function public.undo_guest_order_production_started(uuid, uuid)
  rename to _undo_guest_order_production_started_impl;

alter function public.mark_guest_order_out_for_delivery(uuid, uuid)
  rename to _mark_guest_order_out_for_delivery_impl;
alter function public.undo_guest_order_out_for_delivery(uuid, uuid)
  rename to _undo_guest_order_out_for_delivery_impl;
alter function public.mark_guest_order_delivered(uuid, uuid)
  rename to _mark_guest_order_delivered_impl;
alter function public.undo_guest_order_delivered(uuid, uuid)
  rename to _undo_guest_order_delivered_impl;

revoke all on function public._hold_extra_stock_walk_in_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._extend_extra_stock_walk_in_hold_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._release_extra_stock_walk_in_hold_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._mark_guest_order_picked_up_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._undo_guest_order_picked_up_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._mark_guest_order_ready_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._undo_guest_order_ready_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._mark_guest_order_production_started_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._undo_guest_order_production_started_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._mark_guest_order_out_for_delivery_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._undo_guest_order_out_for_delivery_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._mark_guest_order_delivered_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._undo_guest_order_delivered_impl(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.hold_extra_stock_walk_in(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._hold_extra_stock_walk_in_impl(p_extra_stock_id, v_actor);
end;
$$;

create or replace function public.extend_extra_stock_walk_in_hold(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._extend_extra_stock_walk_in_hold_impl(p_extra_stock_id, v_actor);
end;
$$;

create or replace function public.release_extra_stock_walk_in_hold(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._release_extra_stock_walk_in_hold_impl(p_extra_stock_id, v_actor);
end;
$$;

create or replace function public.mark_guest_order_picked_up(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._mark_guest_order_picked_up_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.undo_guest_order_picked_up(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._undo_guest_order_picked_up_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.mark_guest_order_ready(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._mark_guest_order_ready_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.undo_guest_order_ready(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._undo_guest_order_ready_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.mark_guest_order_production_started(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._mark_guest_order_production_started_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.undo_guest_order_production_started(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  return public._undo_guest_order_production_started_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.mark_guest_order_out_for_delivery(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'collection', 'customer_operations']::text[],
    'Not authorized to mark out for delivery'
  );
  return public._mark_guest_order_out_for_delivery_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.undo_guest_order_out_for_delivery(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'collection', 'customer_operations']::text[],
    'Not authorized to undo out for delivery'
  );
  return public._undo_guest_order_out_for_delivery_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.mark_guest_order_delivered(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'collection', 'customer_operations']::text[],
    'Not authorized to mark delivered'
  );
  return public._mark_guest_order_delivered_impl(p_order_id, v_actor);
end;
$$;

create or replace function public.undo_guest_order_delivered(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'collection', 'customer_operations']::text[],
    'Not authorized to undo delivered'
  );
  return public._undo_guest_order_delivered_impl(p_order_id, v_actor);
end;
$$;

grant execute on function public.hold_extra_stock_walk_in(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.extend_extra_stock_walk_in_hold(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.release_extra_stock_walk_in_hold(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_guest_order_picked_up(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_picked_up(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_guest_order_ready(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_ready(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_guest_order_production_started(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_production_started(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_guest_order_out_for_delivery(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_out_for_delivery(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mark_guest_order_delivered(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_delivered(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Post-payment change + payment-request RPCs
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure(
    'public.guard_post_payment_customer_change(uuid, uuid, boolean)'
  ) is null then
    return;
  end if;

  execute $sql$
    alter function public.guard_post_payment_customer_change(uuid, uuid, boolean)
      rename to _guard_post_payment_customer_change_impl
  $sql$;
  execute $sql$
    revoke all on function public._guard_post_payment_customer_change_impl(
      uuid, uuid, boolean
    ) from public, anon, authenticated
  $sql$;
  execute $sql$
    create or replace function public.guard_post_payment_customer_change(
      p_order_id uuid,
      p_actor_staff_id uuid,
      p_override boolean default false
    )
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
    as $fn$
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
    $fn$
  $sql$;
  execute $sql$
    grant execute on function public.guard_post_payment_customer_change(
      uuid, uuid, boolean
    ) to authenticated, service_role
  $sql$;
end;
$$;

alter function public.mark_guest_payment_request_sent(
  uuid, uuid, text, text, timestamptz
) rename to _mark_guest_payment_request_sent_impl;
revoke all on function public._mark_guest_payment_request_sent_impl(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

create or replace function public.mark_guest_payment_request_sent(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_method text,
  p_message_body text,
  p_deadline_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager', 'customer_operations']::text[],
    'Not authorized to mark a payment request sent'
  );
  return public._mark_guest_payment_request_sent_impl(
    p_order_id,
    v_actor,
    p_method,
    p_message_body,
    p_deadline_at
  );
end;
$$;

grant execute on function public.mark_guest_payment_request_sent(
  uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

alter function public.extend_guest_payment_deadline(uuid, uuid, timestamptz)
  rename to _extend_guest_payment_deadline_impl;
revoke all on function public._extend_guest_payment_deadline_impl(
  uuid, uuid, timestamptz
) from public, anon, authenticated;

create or replace function public.extend_guest_payment_deadline(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_deadline_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager']::text[],
    'Not authorized to extend a payment deadline'
  );
  return public._extend_guest_payment_deadline_impl(
    p_order_id,
    v_actor,
    p_deadline_at
  );
end;
$$;

grant execute on function public.extend_guest_payment_deadline(
  uuid, uuid, timestamptz
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Verified payment RPC: bind verifier, role-check, allow CRM-linked orders
-- ---------------------------------------------------------------------------

create or replace function public.record_and_verify_guest_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_method_description text,
  p_paid_at timestamptz,
  p_reference_note text,
  p_verifier_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_method text;
  v_method_description text;
  v_amount numeric(10, 2);
  v_payment_id uuid;
  v_amount_due numeric(10, 2);
  v_net_received numeric(10, 2);
  v_remaining numeric(10, 2);
  v_new_status public.order_status;
  v_verifier uuid;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  v_verifier := public._bind_rpc_actor(p_verifier_staff_id);
  perform public._require_rpc_roles(
    v_verifier,
    array['owner', 'manager', 'customer_operations']::text[],
    'Not authorized to record payment'
  );
  if p_paid_at is null then
    raise exception 'Payment date/time is required';
  end if;

  v_amount := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amount <= 0 then
    raise exception 'Amount received must be greater than zero';
  end if;

  v_method := nullif(trim(coalesce(p_method, '')), '');
  if v_method is null or v_method not in ('wb_qr', 'online_transfer', 'others') then
    raise exception 'Invalid payment method';
  end if;

  v_method_description := nullif(trim(coalesce(p_method_description, '')), '');
  if v_method = 'others' and v_method_description is null then
    raise exception 'Description is required when payment method is Others';
  end if;
  if v_method <> 'others' then
    v_method_description := null;
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status <> 'awaiting_payment' then
    raise exception 'Payments can only be recorded while awaiting payment';
  end if;

  insert into public.payments (
    amount,
    method,
    method_description,
    paid_at,
    reference_note,
    verified_by,
    verified_at,
    status
  ) values (
    v_amount,
    v_method,
    v_method_description,
    p_paid_at,
    nullif(trim(coalesce(p_reference_note, '')), ''),
    v_verifier,
    now(),
    'verified'
  )
  returning id into v_payment_id;

  insert into public.payment_allocations (
    payment_id,
    order_id,
    amount
  ) values (
    v_payment_id,
    p_order_id,
    v_amount
  );

  v_amount_due := public.order_amount_due(p_order_id);
  v_net_received := public.order_net_received(p_order_id);
  v_remaining := greatest(v_amount_due - v_net_received, 0)::numeric(10, 2);

  if v_net_received >= v_amount_due then
    v_new_status := 'paid'::public.order_status;
    update public.orders o
    set
      status = 'paid',
      payment_status = 'paid',
      updated_by = v_verifier,
      updated_at = now()
    where o.id = p_order_id
    returning * into order_row;
  else
    v_new_status := 'awaiting_payment'::public.order_status;
    update public.orders o
    set
      updated_by = v_verifier,
      updated_at = now()
    where o.id = p_order_id
    returning * into order_row;
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    case
      when v_new_status = 'paid' then 'payment_secured'
      else 'payment_recorded'
    end,
    v_verifier,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', v_amount,
      'method', v_method,
      'method_description', v_method_description,
      'paid_at', p_paid_at,
      'amount_due', v_amount_due,
      'net_received', v_net_received,
      'remaining_balance', v_remaining,
      'order_status', v_new_status::text
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', p_order_id,
    'order_status', v_new_status::text,
    'amount_due', v_amount_due,
    'net_received', v_net_received,
    'remaining_balance', v_remaining
  );
end;
$$;

revoke all on function public.record_and_verify_guest_order_payment(
  uuid, numeric, text, text, timestamptz, text, uuid
) from public, anon;
grant execute on function public.record_and_verify_guest_order_payment(
  uuid, numeric, text, text, timestamptz, text, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Close open authenticated financial writes
-- ---------------------------------------------------------------------------

drop policy if exists payments_authenticated_insert on public.payments;
drop policy if exists payment_allocations_authenticated_insert
  on public.payment_allocations;
drop policy if exists order_adjustments_authenticated_insert
  on public.order_adjustments;
drop policy if exists order_adjustments_authenticated_update
  on public.order_adjustments;

create or replace function public.prevent_direct_order_payment_mutation()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE'
     and (
       NEW.payment_status is distinct from OLD.payment_status
       or (NEW.status is distinct from OLD.status and NEW.status = 'paid')
     )
     and current_user in ('authenticated', 'anon')
  then
    raise exception
      'Payment status can only be changed through the verified payment workflow';
  end if;
  return NEW;
end;
$$;

drop trigger if exists orders_prevent_direct_payment_mutation on public.orders;
create trigger orders_prevent_direct_payment_mutation
before update on public.orders
for each row
execute function public.prevent_direct_order_payment_mutation();
