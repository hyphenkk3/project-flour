/** Shared PostgREST select for Collection board/detail. */

export const COLLECTION_ORDER_SELECT = `
  id,
  order_number,
  guest_name,
  guest_phone,
  customer_id,
  pickup_date,
  pickup_time,
  fulfilment_method,
  status,
  customer_notes,
  production_started_at,
  ready_at,
  picked_up_at,
  out_for_delivery_at,
  delivered_at,
  include_receipt,
  order_dine_in_reservations (
    reservation_date,
    reservation_time,
    venue,
    guest_count,
    reservation_note,
    status
  ),
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
