-- M4-P2 Slice 1 security correction — sync_guest_order_fulfilment ACL
-- Additive. Does NOT amend 20260810120000_m4_p2_fulfilment_delivery_details.sql.
--
-- Defect: public.sync_guest_order_fulfilment was directly executable by anon
-- (SECURITY DEFINER), allowing anon to mutate Delivery → Pickup and delete
-- order_delivery_details.
--
-- Scope: NEW M4-P2 fulfilment client RPC only.
-- Does NOT change sync_guest_order_items / sync_guest_order_paid_addons
-- (pre-existing guest-sync architecture debt).
-- Does NOT change function body.

revoke all on function public.sync_guest_order_fulfilment(
  uuid,
  public.fulfilment_method,
  jsonb
) from public;

revoke all on function public.sync_guest_order_fulfilment(
  uuid,
  public.fulfilment_method,
  jsonb
) from anon;

grant execute on function public.sync_guest_order_fulfilment(
  uuid,
  public.fulfilment_method,
  jsonb
) to authenticated;

comment on function public.sync_guest_order_fulfilment(
  uuid,
  public.fulfilment_method,
  jsonb
) is
  'Owner guest-order fulfilment sync. Atomically sets fulfilment_method and '
  'upserts/deletes order_delivery_details. Does not mutate cakes, paid add-ons, '
  'payments, adjustments, or confirmation state. '
  'EXECUTE granted to authenticated only; revoked from public/anon '
  '(M4-P2 Slice 1 security correction).';

-- Reaffirm internal helper remains non-client (no grant changes that loosen).
revoke all on function public._sync_order_fulfilment_from_payload(
  uuid,
  public.fulfilment_method,
  jsonb
) from public;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid,
  public.fulfilment_method,
  jsonb
) from anon;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid,
  public.fulfilment_method,
  jsonb
) from authenticated;
