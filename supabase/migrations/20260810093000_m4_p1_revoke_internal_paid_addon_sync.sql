-- M4-P1 Slice 1 security correction — internal paid-add-on sync helper
-- Additive. Does not amend 20260810090000_m4_p1_paid_order_addons.sql.
--
-- Defect: public._sync_order_paid_addons_from_payload was directly callable
-- by client roles (including anon), violating approved internal-helper design.
--
-- Does NOT change privileges on sync_guest_order_items / sync_guest_order_paid_addons
-- or other pre-existing guest-order RPCs (future dedicated security review).

revoke all on function public._sync_order_paid_addons_from_payload(uuid, jsonb)
  from public;

revoke all on function public._sync_order_paid_addons_from_payload(uuid, jsonb)
  from anon;

revoke all on function public._sync_order_paid_addons_from_payload(uuid, jsonb)
  from authenticated;

comment on function public._sync_order_paid_addons_from_payload(uuid, jsonb) is
  'INTERNAL ONLY — server-authoritative paid-add-on sync helper. '
  'Not a client RPC. Called by create_staff_guest_preorder and '
  'sync_guest_order_paid_addons (SECURITY DEFINER). '
  'EXECUTE revoked from public/anon/authenticated.';
