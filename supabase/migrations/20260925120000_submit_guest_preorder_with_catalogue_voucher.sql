-- DEV checkout critical path: one anonymous transaction that creates the
-- guest preorder and, when requested, applies the catalogue voucher.
--
-- Does NOT copy financial logic. Calls the existing
-- submit_guest_preorder and apply_catalogue_voucher_to_guest_order
-- functions. If apply fails, the order insert rolls back.

create or replace function public.submit_guest_preorder_with_catalogue_voucher(
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
set search_path = public
as $$
declare
  new_order public.orders;
begin
  new_order := public.submit_guest_preorder(
    p_customer_name,
    p_phone,
    p_email,
    p_pickup_date,
    p_pickup_time,
    p_notes,
    p_items,
    p_email_submission_receipt_requested,
    p_complimentary,
    p_paid_addons,
    p_include_receipt,
    p_fulfilment_method,
    p_delivery,
    p_dine_in,
    p_price_ack,
    p_delivery_processing_fee_ack
  );

  if p_catalogue_voucher_id is not null then
    perform public.apply_catalogue_voucher_to_guest_order(
      new_order.id,
      p_catalogue_voucher_id,
      null
    );
    select * into new_order from public.orders where id = new_order.id;
  end if;

  return new_order;
end;
$$;

comment on function public.submit_guest_preorder_with_catalogue_voucher(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) is
  'Website Whole Cake submit plus optional catalogue voucher in one transaction. '
  'Delegates to submit_guest_preorder and apply_catalogue_voucher_to_guest_order. '
  'Does not change eligibility, stacking, settlement, RM10, or August Promo rules.';

revoke all on function public.submit_guest_preorder_with_catalogue_voucher(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) from public;
grant execute on function public.submit_guest_preorder_with_catalogue_voucher(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb, jsonb, jsonb, uuid
) to anon, authenticated;
