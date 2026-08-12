/** Shared PostgREST select for M5 Bakery board/detail (no server imports). */

export const BAKERY_ORDER_SELECT = `
  id,
  order_number,
  guest_name,
  customer_id,
  pickup_date,
  pickup_time,
  fulfilment_method,
  status,
  customer_notes,
  needs_bakery_attention,
  bakery_attention_note,
  ready_at,
  picked_up_at,
  out_for_delivery_at,
  include_receipt,
  order_items (
    id,
    cake_name,
    size_label,
    quantity
  ),
  order_complimentary_items (
    id,
    name,
    quantity,
    sort_order
  ),
  order_paid_addons (
    id,
    code,
    name,
    quantity,
    sort_order,
    written_message,
    order_paid_addon_messages (
      card_index,
      written_message
    )
  )
`;
