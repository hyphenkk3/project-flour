-- Issue #9: restrict order-linked table access to active, unarchived staff,
-- preserve public Fresh Pick reads and guest RPC flows, and bind vulnerable
-- staff RPC actor IDs to the authenticated staff identity.

begin;

do $preflight$
declare
  v_table text;
  v_required text[] := array[
    'orders', 'order_items', 'order_complimentary_items',
    'order_timeline_events', 'order_confirmation_snapshots',
    'order_adjustments', 'payment_allocations', 'refunds',
    'physical_discount_voucher_redemptions', 'order_paid_addons',
    'order_delivery_details', 'extra_stock', 'operations_approval_requests',
    'order_dine_in_reservations', 'production_capacity_holds',
    'waiting_list_requests', 'waiting_list_items', 'staff_notification_events',
    'waiting_list_confirmation_links', 'catalogue_voucher_redemptions',
    'payment_corrections', 'fresh_pick_readiness_undo_holds', 'payments'
  ];
begin
  foreach v_table in array v_required loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Issue #9 preflight failed: required relation public.% is missing', v_table;
    end if;
    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass(format('public.%I', v_table))
    ) then
      raise exception 'Issue #9 preflight failed: RLS is not enabled on public.%', v_table;
    end if;
  end loop;

  if to_regprocedure('public._bind_rpc_actor(uuid)') is null
     or to_regprocedure('public._require_rpc_roles(uuid,text[],text)') is null then
    raise exception 'Issue #9 preflight failed: reviewed actor-binding helpers are missing';
  end if;
end;
$preflight$;

create schema issue9_private authorization postgres;
revoke all on schema issue9_private from public, anon, authenticated;
grant usage on schema issue9_private to authenticated;

create function issue9_private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active is true
      and sp.archived_at is null
      and r.code = any (array['owner', 'manager', 'customer_operations', 'collection', 'bakery']::text[])
  );
$function$;
revoke all on function issue9_private.is_active_staff() from public, anon;
grant execute on function issue9_private.is_active_staff() to authenticated;

-- Correct the shared role helper so existing role-based policies also reject
-- inactive and archived staff rather than relying on a claimed staff ID.
create or replace function public._current_staff_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select r.code
  from public.staff_profiles sp
  join public.roles r on r.id = sp.role_id
  where sp.auth_user_id = auth.uid()
    and sp.is_active is true
    and sp.archived_at is null
  limit 1;
$function$;

-- Every direct authenticated policy on order, payment and waiting-list records
-- is constrained by this restrictive policy. Existing role-specific policies
-- remain in force as additional checks.
do $policies$
declare
  v_table text;
  v_tables text[] := array[
    'orders', 'order_items', 'order_complimentary_items',
    'order_timeline_events', 'order_confirmation_snapshots',
    'order_adjustments', 'payment_allocations', 'refunds',
    'physical_discount_voucher_redemptions', 'order_paid_addons',
    'order_delivery_details', 'operations_approval_requests',
    'order_dine_in_reservations', 'production_capacity_holds',
    'waiting_list_requests', 'waiting_list_items', 'staff_notification_events',
    'waiting_list_confirmation_links', 'catalogue_voucher_redemptions',
    'payment_corrections', 'fresh_pick_readiness_undo_holds', 'payments'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop policy if exists issue9_active_staff_only on public.%I', v_table);
    execute format(
      'create policy issue9_active_staff_only on public.%I as restrictive for all to authenticated using (issue9_private.is_active_staff()) with check (issue9_private.is_active_staff())',
      v_table
    );
  end loop;

  -- Logged-in customers may browse the same confirmed Fresh Pick stock exposed
  -- to anonymous visitors. Active bakery staff retain their complete stock view.
  drop policy if exists extra_stock_authenticated_select on public.extra_stock;
  create policy extra_stock_authenticated_select on public.extra_stock
    for select to authenticated
    using (
      issue9_private.is_active_staff()
      or (
        lifecycle = 'confirmed'
        and sold_at is null
        and confirmed_at is not null
        and pickup_through_at is not null
        and now() >= confirmed_at
        and now() <= pickup_through_at
      )
    );
end;
$policies$;

-- Remove inherited/public and anonymous direct access to order-linked records.
-- Keep service_role's pre-existing server-side grants untouched.
do $grants$
declare
  v_table text;
  v_column text;
  v_tables text[] := array[
    'orders', 'order_items', 'order_complimentary_items',
    'order_timeline_events', 'order_confirmation_snapshots',
    'order_adjustments', 'payment_allocations', 'refunds',
    'physical_discount_voucher_redemptions', 'order_paid_addons',
    'order_delivery_details', 'extra_stock', 'operations_approval_requests',
    'order_dine_in_reservations', 'production_capacity_holds',
    'waiting_list_requests', 'waiting_list_items', 'staff_notification_events',
    'waiting_list_confirmation_links', 'catalogue_voucher_redemptions',
    'payment_corrections', 'fresh_pick_readiness_undo_holds', 'payments'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', v_table);
    for v_column in
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = v_table
    loop
      execute format(
        'revoke all privileges (%I) on table public.%I from public, anon, authenticated',
        v_column, v_table
      );
    end loop;
  end loop;
end;
$grants$;

-- Minimum direct grants confirmed by current application callers. Mutations not
-- listed here remain inside the existing SECURITY DEFINER RPCs.
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.order_complimentary_items,
  public.order_adjustments, public.payment_allocations, public.refunds,
  public.order_paid_addons, public.order_delivery_details,
  public.payment_corrections,
  public.order_dine_in_reservations, public.production_capacity_holds,
  public.waiting_list_requests, public.waiting_list_items,
  public.staff_notification_events, public.payments to authenticated;
grant select, insert on public.order_timeline_events to authenticated;
grant select, insert, update on public.order_confirmation_snapshots to authenticated;
grant select, insert, update, delete on public.operations_approval_requests to authenticated;

-- The public Fresh Pick contract is read-only; all lifecycle changes use RPCs.
grant select on public.extra_stock to anon, authenticated;

-- Bind caller-supplied staff IDs before the original business logic executes.
-- Fingerprints are against the exact Production-derived PostgreSQL 17 baseline;
-- any drift stops the entire transactional migration.
do $rpc_binding$
declare
  v_signature text;
  v_expected_md5 text;
  v_guard text;
  v_oid oid;
  v_definition text;
  v_replacement text;
  v_targets record;
begin
  for v_targets in
    select * from (values
      ('public.approve_operations_approval_request(uuid,uuid,text)', 'd2f5b44eb9fb1b008cc519c9ecb0af2a', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.approve_preorder_lead_time_exception(uuid,uuid,text)', 'b8a838334d027c354af079dd70ad02fb', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.apply_august_promo_to_guest_order(uuid,uuid)', '5368194d7a35060c3315ff31ddf89735', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id); perform public._require_rpc_roles(p_actor_staff_id, array[''owner'',''manager'',''customer_operations'']::text[], ''Not authorized'');'),
      ('public.cancel_guest_order(uuid,uuid,boolean)', '59165b9e01244bebf1eb72b297c175b4', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.cancel_guest_order_delivery_fee_request(uuid,uuid,text)', 'e1cd8cef96ca8f4c227ba9c06fdd202b', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.cancel_guest_order_processing_fee_request(uuid,uuid,text)', 'ea25f65f1b2849c4c21495c1897d4f01', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.cancel_operations_approval_request(uuid,uuid)', 'b75ce760f68f0edef20b52c6e6e20592', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.change_august_promo_to_rm10_physical_voucher(uuid,uuid,text,date,boolean,text)', '145788bc3bd362781b0c45f25daee8ae', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.confirm_extra_stock(uuid,uuid,date,timestamp with time zone,timestamp with time zone,text)', '46c7fbc81ad8f11b803b8c8fc477ceb7', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.correct_preorder_exception_customer_informed(uuid,uuid,text)', 'b58ddb5ecbc547324ce5b076ed614f91', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.create_confirmed_extra_stock(uuid,text,text,date,timestamp with time zone,timestamp with time zone,text,uuid,uuid)', '1167c1c6607f7bfc69c744c082af2584', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.create_operations_approval_request(uuid,uuid,text,text,jsonb)', 'd81755e3719594e3446e84afd0ded5cd', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.create_owner_manual_guest_preorder_with_catalogue_override(uuid,text,text,text,text,text,boolean,date,time without time zone,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,fulfilment_method,jsonb,jsonb)', '34b118bdeba0181420800cf0c5b97fdc', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id); perform public._require_rpc_roles(p_actor_staff_id, array[''owner'']::text[], ''Only an active Owner may create manual orders'');'),
      ('public.create_preorder_lead_time_exception_request(uuid,uuid,text,jsonb)', '2f502705c98041c2d304287baa7d9e8c', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.create_staff_guest_preorder_with_source_detail(uuid,text,text,text,text,text,boolean,date,time without time zone,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,fulfilment_method,jsonb,jsonb)', '640e8b827e05e9bc658330cedb0b2314', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.init_guest_order_delivery_finance(uuid,uuid)', 'c421a952cb6a4129859b90604a48c2bd', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id); perform public._require_rpc_roles(p_actor_staff_id, array[''owner'']::text[], ''Only an active Owner may initialize delivery finance'');'),
      ('public.invalidate_waiting_list_confirmation_links(uuid,uuid)', 'f51ef4c4eadf666dbc342b3279a115a9', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.issue_waiting_list_confirmation_link(uuid,uuid,text)', 'd7cbe83df0a185b518fcac9284a6b825', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.mark_preorder_exception_customer_informed(uuid,uuid)', 'ed7fdccfff46d230467f36645f0a7eb8', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.move_extra_stock_fresh_pick_window(uuid,uuid,date,timestamp with time zone,timestamp with time zone)', 'e636b5765bd8b124f187226a0cc9d351', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.override_guest_order_processing_fee(uuid,uuid,numeric,text)', 'b803e6a86ba110a2c11a5bf322268bac', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.propose_extra_stock(uuid,text,text,date,text,uuid,uuid)', '82f589ba866014b1329a07e2bfc6678e', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.record_order_availability_closed(date,uuid,text)', '62c06b381c2e20bbd3c194b199f6a36e', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.record_order_availability_reopened(date,uuid,text)', 'd04ab18dc2e48c39eb1d116a233ecd31', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.redeem_rm10_physical_voucher_for_guest_order(uuid,uuid,text,date,boolean,text)', 'a7e48c7795df6354af2a7a324728a720', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.reject_extra_stock(uuid,uuid,text)', '8fcccfb195dadab09532a239c5450220', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.reject_operations_approval_request(uuid,uuid,text)', '746c14155acc003b3b34ceacb7c7699e', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.request_guest_order_delivery_fee_waiver(uuid,uuid,text)', 'e183cb725585f87eb0990ccb5b77962f', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.request_guest_order_processing_fee_change(uuid,uuid,text,numeric,text)', '25d160c5bf42ecd7bd470f1dcc47a133', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.resolve_guest_order_delivery_fee_request(uuid,uuid,boolean,text)', 'b8f64a5581be3dcb977a072b765b9586', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.resolve_guest_order_processing_fee_request(uuid,uuid,boolean,text)', 'b6445f27d2be3b9a88dad1855edaae11', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.restore_guest_order_delivery_fee(uuid,uuid,text)', 'b9e2da739dceb70382c5f657eb58d350', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.restore_guest_order_processing_fee(uuid,uuid,text)', 'bab251620a6070dbcb2715dfae4c85e0', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.reverse_active_guest_order_adjustment(uuid,uuid,uuid)', 'acd34a61eb2f19f1c9d62199e8861845', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id); perform public._require_rpc_roles(p_actor_staff_id, array[''owner'',''manager'',''customer_operations'']::text[], ''Not authorized'');'),
      ('public.set_guest_order_delivery_fee_quote(uuid,uuid,numeric)', '47fea3430f975fbbbc817a27ad76ae41', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.set_production_capacity(uuid,date,uuid,uuid,uuid,integer,text)', '9e51f967c9a543444dac7ed5f62e1ef7', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.set_production_capacity_waiting_list(uuid,uuid,boolean)', 'a80dc228ddaee31a1eea02c3caf72179', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.staff_list_waiting_list_confirmation_links(uuid,uuid[])', '2a72d49633428d7d8c45e5a288095705', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.unconfirm_extra_stock(uuid,uuid)', '20bb5a9b1d5d77b66f9f17b14e0d3f7a', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.undo_extra_stock_rejected(uuid,uuid)', '66e2f8cf7f5f97ab2ee8ee165c07925d', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_cancel_item(uuid,uuid,text,text)', '5921570c97025d0cd3e3cada5e1b8fc2', 'if p_actor_staff_id is not null then p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id); end if;'),
      ('public.waiting_list_close_remaining(uuid,uuid)', '0e0e705b082d92bc361d3069464079fb', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_contact_item(uuid,uuid,integer)', '74dcd79ef58d78b59c94efaab4f6e61b', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_offer_alternative(uuid,uuid,uuid,uuid,integer)', '74a5ed823e1acc712627217c7fe74dbf', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_record_alternative_response(uuid,uuid,boolean,uuid,uuid,integer,boolean)', 'ec7bd07918e423c5380a95b10ee46cb0', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_record_response(uuid,uuid,text,integer,boolean,text)', '92571f423c042fcaa84a793db2c71827', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_replace_item_scope(uuid,uuid,date,uuid,uuid)', '3c4b4066860cc009c003d7dbbe2a4c80', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waiting_list_set_item_quantity(uuid,uuid,integer)', '6a37e2dc17cbc027fe7ff4e4fe7f9744', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waive_guest_order_delivery_fee(uuid,uuid,text)', 'b4ef749993043c714ab11c89521a48a4', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.waive_guest_order_processing_fee(uuid,uuid,text)', 'c499f23e3fb2d477dc2f22fe9741a91c', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);'),
      ('public.withdraw_preorder_lead_time_exception(uuid,uuid,text)', 'c1457dac400b51059746e80ca6ccdcb3', 'p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);')
    ) as t(signature, expected_md5, guard_sql)
  loop
    v_oid := to_regprocedure(v_targets.signature);
    if v_oid is null then
      raise exception 'Issue #9 preflight failed: missing function %', v_targets.signature;
    end if;
    v_definition := pg_get_functiondef(v_oid);
    if not (
      select p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
        and has_function_privilege('authenticated', p.oid, 'execute')
      from pg_proc p
      where p.oid = v_oid
    ) then
      raise exception 'Issue #9 preflight failed: reviewed owner, SECURITY DEFINER, or authenticated grant changed for %', v_targets.signature;
    end if;
    if md5(v_definition) <> v_targets.expected_md5 then
      raise exception 'Issue #9 preflight failed: unexpected function fingerprint for %', v_targets.signature;
    end if;
    if regexp_count(v_definition, E'\\nbegin\\n') <> 1 then
      raise exception 'Issue #9 preflight failed: cannot safely bind actor in %', v_targets.signature;
    end if;
    v_replacement := replace(
      v_definition,
      E'\nbegin\n',
      E'\nbegin\n  ' || v_targets.guard_sql || E'\n'
    );
    execute v_replacement;
  end loop;
end;
$rpc_binding$;

-- Staff RPCs must not remain anonymously callable through default PUBLIC grants.
revoke all on function public.apply_august_promo_to_guest_order(uuid,uuid) from public, anon;
revoke all on function public.reverse_active_guest_order_adjustment(uuid,uuid,uuid) from public, anon;
revoke all on function public.change_august_promo_to_rm10_physical_voucher(uuid,uuid,text,date,boolean,text) from public, anon;
revoke all on function public.redeem_rm10_physical_voucher_for_guest_order(uuid,uuid,text,date,boolean,text) from public, anon;
revoke all on function public.confirm_extra_stock(uuid,uuid,date,timestamptz,timestamptz,text) from public, anon;
revoke all on function public.move_extra_stock_fresh_pick_window(uuid,uuid,date,timestamptz,timestamptz) from public, anon;
revoke all on function public.propose_extra_stock(uuid,text,text,date,text,uuid,uuid) from public, anon;
revoke all on function public.reject_extra_stock(uuid,uuid,text) from public, anon;
revoke all on function public.unconfirm_extra_stock(uuid,uuid) from public, anon;
revoke all on function public.undo_extra_stock_rejected(uuid,uuid) from public, anon;
grant execute on function public.apply_august_promo_to_guest_order(uuid,uuid) to authenticated, service_role;
grant execute on function public.reverse_active_guest_order_adjustment(uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.change_august_promo_to_rm10_physical_voucher(uuid,uuid,text,date,boolean,text) to authenticated, service_role;
grant execute on function public.redeem_rm10_physical_voucher_for_guest_order(uuid,uuid,text,date,boolean,text) to authenticated, service_role;
grant execute on function public.confirm_extra_stock(uuid,uuid,date,timestamptz,timestamptz,text) to authenticated, service_role;
grant execute on function public.move_extra_stock_fresh_pick_window(uuid,uuid,date,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.propose_extra_stock(uuid,text,text,date,text,uuid,uuid) to authenticated, service_role;
grant execute on function public.reject_extra_stock(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.unconfirm_extra_stock(uuid,uuid) to authenticated, service_role;
grant execute on function public.undo_extra_stock_rejected(uuid,uuid) to authenticated, service_role;

-- This RPC intentionally supports both authenticated staff cancellation and a
-- phone-matched guest cancellation. The wrapper binds only the staff branch.
revoke all on function public.waiting_list_cancel_item(uuid,uuid,text,text) from public;
grant execute on function public.waiting_list_cancel_item(uuid,uuid,text,text) to anon, authenticated, service_role;

-- Internal/service-only helpers are not public RPC APIs. Guest submissions
-- continue to reach them through their existing definer-owned submit RPCs.
revoke all on function public.apply_catalogue_voucher_to_guest_order(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.apply_catalogue_voucher_to_guest_order(uuid,uuid,uuid) to service_role;
revoke all on function public.sync_guest_order_items(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.sync_guest_order_paid_addons(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.refresh_guest_order_rm10_issuance_suppression(uuid,uuid) from public, anon, authenticated;
revoke all on function public.guest_order_has_adjustment_code(uuid,text) from public, anon, authenticated;
revoke all on function public.guest_order_has_eligible_rm10_size(uuid) from public, anon, authenticated;
revoke all on function public.guest_order_has_verified_payments(uuid) from public, anon, authenticated;
revoke all on function public.order_paid_addons_subtotal(uuid) from public, anon, authenticated;
revoke all on function public._clear_extra_walk_in_hold(uuid) from public, anon, authenticated;
revoke all on function public._record_extra_stock_event(uuid,text,uuid,jsonb) from public, anon, authenticated;

commit;
