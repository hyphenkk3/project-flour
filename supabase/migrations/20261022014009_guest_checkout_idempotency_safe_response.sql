-- Keep anonymous checkout responses limited to the order UUID. The prior
-- wrappers return the complete orders composite, which contains guest data.
-- Only the new UUID-returning wrappers remain callable by guest roles.

revoke execute on function public.submit_guest_preorder_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.submit_guest_preorder_with_catalogue_voucher_idempotent(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;
revoke execute on function public.submit_guest_extra_order_idempotent(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public, anon, authenticated;

create or replace function public.submit_guest_preorder_idempotent_v2(
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  submitted_order public.orders;
begin
  submitted_order := public.submit_guest_preorder_idempotent(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_items,
    p_email_submission_receipt_requested, p_complimentary, p_paid_addons,
    p_include_receipt, p_fulfilment_method, p_delivery, p_dine_in,
    p_price_ack, p_delivery_processing_fee_ack
  );
  return submitted_order.id;
end;
$function$;

create or replace function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v2(
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  submitted_order public.orders;
begin
  submitted_order := public.submit_guest_preorder_with_catalogue_voucher_idempotent(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_items,
    p_email_submission_receipt_requested, p_complimentary, p_paid_addons,
    p_include_receipt, p_fulfilment_method, p_delivery, p_dine_in,
    p_price_ack, p_delivery_processing_fee_ack, p_catalogue_voucher_id
  );
  return submitted_order.id;
end;
$function$;

create or replace function public.submit_guest_extra_order_idempotent_v2(
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  submitted_order public.orders;
begin
  submitted_order := public.submit_guest_extra_order_idempotent(
    p_request_id, p_submission_payload, p_customer_name, p_phone, p_email,
    p_pickup_date, p_pickup_time, p_notes, p_extra_stock_id,
    p_email_submission_receipt_requested, p_include_receipt,
    p_complimentary, p_paid_addons, p_extra_stock_ids,
    p_fulfilment_method, p_delivery, p_dine_in,
    p_delivery_processing_fee_ack
  );
  return submitted_order.id;
end;
$function$;

revoke all on function public.submit_guest_preorder_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_preorder_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb
) to anon, authenticated, service_role;
revoke all on function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public;
grant execute on function public.submit_guest_preorder_with_catalogue_voucher_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, jsonb, boolean, jsonb,
  jsonb, boolean, public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) to anon, authenticated, service_role;
revoke all on function public.submit_guest_extra_order_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_extra_order_idempotent_v2(
  uuid, jsonb, text, text, text, date, time, text, uuid, boolean, boolean,
  jsonb, jsonb, uuid[], public.fulfilment_method, jsonb, jsonb, jsonb
) to anon, authenticated, service_role;
