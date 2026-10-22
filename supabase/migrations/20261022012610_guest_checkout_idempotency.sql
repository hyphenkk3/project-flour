-- Customer checkout retry safety.  The request key is an opaque UUID created
-- for one persisted cart/draft.  Only hashes of submitted data are retained.
-- All checkout writes remain in the existing order RPC transaction.

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated;

create table private.guest_checkout_attempts (
  request_id uuid primary key,
  checkout_flow text not null check (checkout_flow in ('whole_cake', 'fresh_pick')),
  submission_digest bytea not null,
  rpc_digest bytea not null,
  order_id uuid not null,
  created_at timestamptz not null default now()
);

alter table private.guest_checkout_attempts enable row level security;
revoke all on table private.guest_checkout_attempts from public, anon, authenticated, service_role;

create or replace function private.guest_checkout_digest(
  p_request_id uuid,
  p_checkout_flow text,
  p_payload jsonb
)
returns bytea
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select extensions.digest(
    pg_catalog.convert_to(
      p_request_id::text || ':' || p_checkout_flow || ':' || coalesce(p_payload, 'null'::jsonb)::text,
      'UTF8'
    ),
    'sha256'
  );
$function$;

revoke all on function private.guest_checkout_digest(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.resolve_guest_checkout_attempt(
  p_request_id uuid,
  p_checkout_flow text,
  p_submission_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attempt_row private.guest_checkout_attempts;
  v_digest bytea;
begin
  if p_request_id is null
     or p_checkout_flow is null
     or p_checkout_flow not in ('whole_cake', 'fresh_pick')
     or p_submission_payload is null
     or pg_catalog.jsonb_typeof(p_submission_payload) <> 'object' then
    raise exception 'Checkout attempt is invalid';
  end if;

  v_digest := private.guest_checkout_digest(
    p_request_id, p_checkout_flow, p_submission_payload
  );

  select a.* into attempt_row
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;

  if not found then
    return null;
  end if;

  if attempt_row.checkout_flow is distinct from p_checkout_flow
     or attempt_row.submission_digest is distinct from v_digest then
    raise exception 'This checkout attempt was already used with different details. Please contact Whitebird before submitting again.';
  end if;

  if not exists (select 1 from public.orders o where o.id = attempt_row.order_id) then
    raise exception 'The result for this checkout attempt is unavailable. Please contact Whitebird before submitting again.';
  end if;

  return attempt_row.order_id;
end;
$function$;

revoke all on function public.resolve_guest_checkout_attempt(uuid, text, jsonb)
  from public;
grant execute on function public.resolve_guest_checkout_attempt(uuid, text, jsonb)
  to anon, authenticated, service_role;

create or replace function public.submit_guest_preorder_idempotent(
  p_request_id uuid,
  p_submission_payload jsonb,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_include_receipt boolean default false,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null,
  p_price_ack jsonb default null,
  p_delivery_processing_fee_ack jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attempt_row private.guest_checkout_attempts;
  new_order public.orders;
  v_submission_digest bytea;
  v_rpc_digest bytea;
begin
  if p_request_id is null or p_submission_payload is null
     or pg_catalog.jsonb_typeof(p_submission_payload) <> 'object' then
    raise exception 'Checkout attempt is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  v_submission_digest := private.guest_checkout_digest(
    p_request_id, 'whole_cake', p_submission_payload
  );
  v_rpc_digest := private.guest_checkout_digest(
    p_request_id,
    'whole_cake_rpc',
    pg_catalog.jsonb_build_object(
      'customer_name', p_customer_name, 'phone', p_phone, 'email', p_email,
      'pickup_date', p_pickup_date, 'pickup_time', p_pickup_time,
      'notes', p_notes, 'items', p_items,
      'email_submission_receipt_requested', p_email_submission_receipt_requested,
      'complimentary', p_complimentary, 'paid_addons', p_paid_addons,
      'include_receipt', p_include_receipt, 'fulfilment_method', p_fulfilment_method,
      'delivery', p_delivery, 'dine_in', p_dine_in,
      'price_ack', p_price_ack,
      'delivery_processing_fee_ack', p_delivery_processing_fee_ack
    )
  );

  select a.* into attempt_row
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;
  if found then
    if attempt_row.checkout_flow is distinct from 'whole_cake'
       or attempt_row.submission_digest is distinct from v_submission_digest
       or attempt_row.rpc_digest is distinct from v_rpc_digest then
      raise exception 'This checkout attempt was already used with different details. Please contact Whitebird before submitting again.';
    end if;
    select o.* into new_order from public.orders o where o.id = attempt_row.order_id;
    if not found then
      raise exception 'The result for this checkout attempt is unavailable. Please contact Whitebird before submitting again.';
    end if;
    return new_order;
  end if;

  new_order := public.submit_guest_preorder(
    p_customer_name, p_phone, p_email, p_pickup_date, p_pickup_time,
    p_notes, p_items, p_email_submission_receipt_requested, p_complimentary,
    p_paid_addons, p_include_receipt, p_fulfilment_method, p_delivery,
    p_dine_in, p_price_ack, p_delivery_processing_fee_ack
  );

  insert into private.guest_checkout_attempts (
    request_id, checkout_flow, submission_digest, rpc_digest, order_id
  ) values (
    p_request_id, 'whole_cake', v_submission_digest, v_rpc_digest, new_order.id
  );
  return new_order;
end;
$function$;

create or replace function public.submit_guest_preorder_with_catalogue_voucher_idempotent(
  p_request_id uuid,
  p_submission_payload jsonb,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_include_receipt boolean default false,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null,
  p_price_ack jsonb default null,
  p_delivery_processing_fee_ack jsonb default null,
  p_catalogue_voucher_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attempt_row private.guest_checkout_attempts;
  new_order public.orders;
  v_submission_digest bytea;
  v_rpc_digest bytea;
begin
  if p_request_id is null or p_submission_payload is null
     or pg_catalog.jsonb_typeof(p_submission_payload) <> 'object' then
    raise exception 'Checkout attempt is invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  v_submission_digest := private.guest_checkout_digest(
    p_request_id, 'whole_cake', p_submission_payload
  );
  v_rpc_digest := private.guest_checkout_digest(
    p_request_id,
    'whole_cake_voucher_rpc',
    pg_catalog.jsonb_build_object(
      'customer_name', p_customer_name, 'phone', p_phone, 'email', p_email,
      'pickup_date', p_pickup_date, 'pickup_time', p_pickup_time,
      'notes', p_notes, 'items', p_items,
      'email_submission_receipt_requested', p_email_submission_receipt_requested,
      'complimentary', p_complimentary, 'paid_addons', p_paid_addons,
      'include_receipt', p_include_receipt, 'fulfilment_method', p_fulfilment_method,
      'delivery', p_delivery, 'dine_in', p_dine_in,
      'price_ack', p_price_ack,
      'delivery_processing_fee_ack', p_delivery_processing_fee_ack,
      'catalogue_voucher_id', p_catalogue_voucher_id
    )
  );
  select a.* into attempt_row from private.guest_checkout_attempts a
  where a.request_id = p_request_id;
  if found then
    if attempt_row.checkout_flow is distinct from 'whole_cake'
       or attempt_row.submission_digest is distinct from v_submission_digest
       or attempt_row.rpc_digest is distinct from v_rpc_digest then
      raise exception 'This checkout attempt was already used with different details. Please contact Whitebird before submitting again.';
    end if;
    select o.* into new_order from public.orders o where o.id = attempt_row.order_id;
    if not found then
      raise exception 'The result for this checkout attempt is unavailable. Please contact Whitebird before submitting again.';
    end if;
    return new_order;
  end if;

  new_order := public.submit_guest_preorder_with_catalogue_voucher(
    p_customer_name, p_phone, p_email, p_pickup_date, p_pickup_time,
    p_notes, p_items, p_email_submission_receipt_requested, p_complimentary,
    p_paid_addons, p_include_receipt, p_fulfilment_method, p_delivery,
    p_dine_in, p_price_ack, p_delivery_processing_fee_ack,
    p_catalogue_voucher_id
  );
  insert into private.guest_checkout_attempts (
    request_id, checkout_flow, submission_digest, rpc_digest, order_id
  ) values (
    p_request_id, 'whole_cake', v_submission_digest, v_rpc_digest, new_order.id
  );
  return new_order;
end;
$function$;

create or replace function public.submit_guest_extra_order_idempotent(
  p_request_id uuid,
  p_submission_payload jsonb,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_extra_stock_id uuid,
  p_email_submission_receipt_requested boolean default false,
  p_include_receipt boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_extra_stock_ids uuid[] default null,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null,
  p_delivery_processing_fee_ack jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attempt_row private.guest_checkout_attempts;
  new_order public.orders;
  v_submission_digest bytea;
  v_rpc_digest bytea;
begin
  if p_request_id is null or p_submission_payload is null
     or pg_catalog.jsonb_typeof(p_submission_payload) <> 'object' then
    raise exception 'Checkout attempt is invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  v_submission_digest := private.guest_checkout_digest(
    p_request_id, 'fresh_pick', p_submission_payload
  );
  v_rpc_digest := private.guest_checkout_digest(
    p_request_id,
    'fresh_pick_rpc',
    pg_catalog.jsonb_build_object(
      'customer_name', p_customer_name, 'phone', p_phone, 'email', p_email,
      'pickup_date', p_pickup_date, 'pickup_time', p_pickup_time,
      'notes', p_notes, 'extra_stock_id', p_extra_stock_id,
      'email_submission_receipt_requested', p_email_submission_receipt_requested,
      'include_receipt', p_include_receipt, 'complimentary', p_complimentary,
      'paid_addons', p_paid_addons, 'extra_stock_ids', p_extra_stock_ids,
      'fulfilment_method', p_fulfilment_method, 'delivery', p_delivery,
      'dine_in', p_dine_in,
      'delivery_processing_fee_ack', p_delivery_processing_fee_ack
    )
  );
  select a.* into attempt_row from private.guest_checkout_attempts a
  where a.request_id = p_request_id;
  if found then
    if attempt_row.checkout_flow is distinct from 'fresh_pick'
       or attempt_row.submission_digest is distinct from v_submission_digest
       or attempt_row.rpc_digest is distinct from v_rpc_digest then
      raise exception 'This checkout attempt was already used with different details. Please contact Whitebird before submitting again.';
    end if;
    select o.* into new_order from public.orders o where o.id = attempt_row.order_id;
    if not found then
      raise exception 'The result for this checkout attempt is unavailable. Please contact Whitebird before submitting again.';
    end if;
    return new_order;
  end if;

  new_order := public.submit_guest_extra_order(
    p_customer_name, p_phone, p_email, p_pickup_date, p_pickup_time,
    p_notes, p_extra_stock_id, p_email_submission_receipt_requested,
    p_include_receipt, p_complimentary, p_paid_addons, p_extra_stock_ids,
    p_fulfilment_method, p_delivery, p_dine_in, p_delivery_processing_fee_ack
  );
  insert into private.guest_checkout_attempts (
    request_id, checkout_flow, submission_digest, rpc_digest, order_id
  ) values (
    p_request_id, 'fresh_pick', v_submission_digest, v_rpc_digest, new_order.id
  );
  return new_order;
end;
$function$;

-- Disable the unkeyed public RPC entry points. The wrappers above call them as
-- their owner; only service_role retains direct execution for trusted tooling.
revoke execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.submit_guest_preorder_with_catalogue_voucher(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;
revoke execute on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb,
  uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public, anon, authenticated;

revoke all on function public.submit_guest_preorder_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_preorder_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) to anon, authenticated, service_role;

revoke all on function public.submit_guest_preorder_with_catalogue_voucher_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public;
grant execute on function public.submit_guest_preorder_with_catalogue_voucher_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) to anon, authenticated, service_role;

revoke all on function public.submit_guest_extra_order_idempotent(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_extra_order_idempotent(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) to anon, authenticated, service_role;
