-- Bind checkout idempotency attempts to a server-issued HttpOnly browser
-- capability. Existing DEV attempts stay nullable so their already-issued
-- order-receipt cookies continue to work, but they cannot be claimed by a
-- different browser after this migration.

alter table private.guest_checkout_attempts
  add column recovery_digest bytea;
alter table private.guest_checkout_attempts
  add column recovery_expires_at timestamptz;

alter table private.guest_checkout_attempts
  add constraint guest_checkout_attempts_recovery_digest_length
  check (recovery_digest is null or pg_catalog.octet_length(recovery_digest) = 32);
alter table private.guest_checkout_attempts
  add constraint guest_checkout_attempts_recovery_pair
  check ((recovery_digest is null) = (recovery_expires_at is null));

comment on column private.guest_checkout_attempts.recovery_digest is
  'SHA-256 digest of a high-entropy, HttpOnly browser recovery cookie. NULL only for attempts created before capability binding.';
comment on column private.guest_checkout_attempts.recovery_expires_at is
  'Server-side recovery deadline matching the 90-day HttpOnly cookie lifetime.';

create or replace function private.checkout_recovery_digest(p_digest text)
returns bytea
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
begin
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Checkout recovery is unavailable. Please refresh checkout and try again.';
  end if;
  return pg_catalog.decode(p_digest, 'hex');
end;
$function$;

revoke all on function private.checkout_recovery_digest(text)
  from public, anon, authenticated, service_role;

create or replace function public.resolve_guest_checkout_attempt_v3(
  p_request_id uuid,
  p_checkout_flow text,
  p_submission_payload jsonb,
  p_recovery_digest text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  attempt_row private.guest_checkout_attempts;
  v_digest bytea;
  v_recovery_digest bytea;
begin
  if p_request_id is null
     or p_checkout_flow is null
     or p_checkout_flow not in ('whole_cake', 'fresh_pick')
     or p_submission_payload is null
     or pg_catalog.jsonb_typeof(p_submission_payload) <> 'object' then
    raise exception 'Checkout recovery is unavailable. Please refresh checkout and try again.';
  end if;

  v_recovery_digest := private.checkout_recovery_digest(p_recovery_digest);
  v_digest := private.guest_checkout_digest(
    p_request_id, p_checkout_flow, p_submission_payload
  );

  select a.* into attempt_row
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;

  if not found then
    return null;
  end if;

  if attempt_row.recovery_digest is null
     or attempt_row.recovery_digest is distinct from v_recovery_digest
     or attempt_row.recovery_expires_at is null
     or attempt_row.recovery_expires_at <= pg_catalog.now()
     or attempt_row.checkout_flow is distinct from p_checkout_flow
     or attempt_row.submission_digest is distinct from v_digest then
    raise exception 'Checkout recovery is unavailable. Please refresh checkout or contact Whitebird.';
  end if;

  if not exists (select 1 from public.orders o where o.id = attempt_row.order_id) then
    raise exception 'Checkout recovery is unavailable. Please contact Whitebird.';
  end if;

  return attempt_row.order_id;
end;
$function$;

-- The old resolver returns an order identifier from the idempotency key and
-- payload alone. Keep it for trusted server-side compatibility only.
revoke all on function public.resolve_guest_checkout_attempt(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_guest_checkout_attempt(uuid, text, jsonb)
  to service_role;

revoke all on function public.resolve_guest_checkout_attempt_v3(uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.resolve_guest_checkout_attempt_v3(uuid, text, jsonb, text)
  to service_role;

create or replace function public.submit_guest_preorder_idempotent_v3(
  p_request_id uuid,
  p_recovery_digest text,
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  existing_recovery_digest bytea;
  existing_recovery_expires_at timestamptz;
  v_recovery_digest bytea;
  submitted_order_id uuid;
begin
  if p_request_id is null then
    raise exception 'Checkout attempt is invalid.';
  end if;
  v_recovery_digest := private.checkout_recovery_digest(p_recovery_digest);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select a.recovery_digest, a.recovery_expires_at
    into existing_recovery_digest, existing_recovery_expires_at
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;

  if found then
    if existing_recovery_digest is null
       or existing_recovery_digest is distinct from v_recovery_digest
       or existing_recovery_expires_at is null
       or existing_recovery_expires_at <= pg_catalog.now() then
      raise exception 'Checkout recovery is unavailable. Please refresh checkout or contact Whitebird.';
    end if;
  end if;

  submitted_order_id := public.submit_guest_preorder_idempotent_v2(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_items,
    p_email_submission_receipt_requested, p_complimentary, p_paid_addons,
    p_include_receipt, p_fulfilment_method, p_delivery, p_dine_in,
    p_price_ack, p_delivery_processing_fee_ack
  );

  if not found then
    update private.guest_checkout_attempts
      set recovery_digest = v_recovery_digest,
          recovery_expires_at = pg_catalog.now() + interval '90 days'
      where request_id = p_request_id
        and recovery_digest is null
        and recovery_expires_at is null;
    if not found then
      raise exception 'Checkout recovery could not be secured. Please contact Whitebird.';
    end if;
  end if;

  return submitted_order_id;
end;
$function$;

create or replace function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v3(
  p_request_id uuid,
  p_recovery_digest text,
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  existing_recovery_digest bytea;
  existing_recovery_expires_at timestamptz;
  v_recovery_digest bytea;
  submitted_order_id uuid;
begin
  if p_request_id is null then
    raise exception 'Checkout attempt is invalid.';
  end if;
  v_recovery_digest := private.checkout_recovery_digest(p_recovery_digest);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select a.recovery_digest, a.recovery_expires_at
    into existing_recovery_digest, existing_recovery_expires_at
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;

  if found then
    if existing_recovery_digest is null
       or existing_recovery_digest is distinct from v_recovery_digest
       or existing_recovery_expires_at is null
       or existing_recovery_expires_at <= pg_catalog.now() then
      raise exception 'Checkout recovery is unavailable. Please refresh checkout or contact Whitebird.';
    end if;
  end if;

  submitted_order_id := public.submit_guest_preorder_with_catalogue_voucher_idempotent_v2(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_items,
    p_email_submission_receipt_requested, p_complimentary, p_paid_addons,
    p_include_receipt, p_fulfilment_method, p_delivery, p_dine_in,
    p_price_ack, p_delivery_processing_fee_ack, p_catalogue_voucher_id
  );

  if not found then
    update private.guest_checkout_attempts
      set recovery_digest = v_recovery_digest,
          recovery_expires_at = pg_catalog.now() + interval '90 days'
      where request_id = p_request_id
        and recovery_digest is null
        and recovery_expires_at is null;
    if not found then
      raise exception 'Checkout recovery could not be secured. Please contact Whitebird.';
    end if;
  end if;

  return submitted_order_id;
end;
$function$;

create or replace function public.submit_guest_extra_order_idempotent_v3(
  p_request_id uuid,
  p_recovery_digest text,
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  existing_recovery_digest bytea;
  existing_recovery_expires_at timestamptz;
  v_recovery_digest bytea;
  submitted_order_id uuid;
begin
  if p_request_id is null then
    raise exception 'Checkout attempt is invalid.';
  end if;
  v_recovery_digest := private.checkout_recovery_digest(p_recovery_digest);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select a.recovery_digest, a.recovery_expires_at
    into existing_recovery_digest, existing_recovery_expires_at
  from private.guest_checkout_attempts a
  where a.request_id = p_request_id;

  if found then
    if existing_recovery_digest is null
       or existing_recovery_digest is distinct from v_recovery_digest
       or existing_recovery_expires_at is null
       or existing_recovery_expires_at <= pg_catalog.now() then
      raise exception 'Checkout recovery is unavailable. Please refresh checkout or contact Whitebird.';
    end if;
  end if;

  submitted_order_id := public.submit_guest_extra_order_idempotent_v2(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_extra_stock_id,
    p_email_submission_receipt_requested, p_include_receipt,
    p_complimentary, p_paid_addons, p_extra_stock_ids,
    p_fulfilment_method, p_delivery, p_dine_in,
    p_delivery_processing_fee_ack
  );

  if not found then
    update private.guest_checkout_attempts
      set recovery_digest = v_recovery_digest,
          recovery_expires_at = pg_catalog.now() + interval '90 days'
      where request_id = p_request_id
        and recovery_digest is null
        and recovery_expires_at is null;
    if not found then
      raise exception 'Checkout recovery could not be secured. Please contact Whitebird.';
    end if;
  end if;

  return submitted_order_id;
end;
$function$;

-- These wrappers are callable only by the server-side Next actions, which
-- read the HttpOnly recovery cookie and never serialize it to the browser.
revoke all on function public.submit_guest_preorder_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.submit_guest_extra_order_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public, anon, authenticated;

revoke all on function public.submit_guest_preorder_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, jsonb, boolean,
  jsonb, jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_guest_preorder_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, jsonb, boolean,
  jsonb, jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, jsonb, boolean,
  jsonb, jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, jsonb, boolean,
  jsonb, jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) to service_role;

revoke all on function public.submit_guest_extra_order_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, uuid, boolean,
  boolean, jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_guest_extra_order_idempotent_v3(
  uuid, text, jsonb, text, text, text, date, time, text, uuid, boolean,
  boolean, jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) to service_role;
