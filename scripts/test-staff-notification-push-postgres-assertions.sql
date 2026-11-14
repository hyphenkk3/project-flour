do $$
declare
  v_count integer;
  v_claimed integer;
  v_claimed_event_count integer;
  v_batch_event_count integer;
  v_delivery_id uuid;
  v_claimed_until timestamptz;
  v_result boolean;
begin
  if exists (select 1 from public.staff_notification_preferences where push_enabled is distinct from false or push_enabled_at is not null) then
    raise exception 'existing preference rows did not receive default-off Push state';
  end if;

  if has_table_privilege('anon', 'public.staff_notification_push_subscriptions', 'select')
    or has_table_privilege('authenticated', 'public.staff_notification_push_subscriptions', 'select')
    or has_table_privilege('anon', 'public.staff_notification_push_deliveries', 'select')
    or has_table_privilege('authenticated', 'public.staff_notification_push_deliveries', 'select')
    or not (select relrowsecurity from pg_class where oid='public.staff_notification_push_subscriptions'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.staff_notification_push_deliveries'::regclass) then
    raise exception 'client role can read Push tables or RLS is disabled';
  end if;

  if has_function_privilege('anon', 'public.register_staff_notification_push_subscription(uuid,text,text,text,timestamp with time zone)', 'execute')
    or has_function_privilege('authenticated', 'public.register_staff_notification_push_subscription(uuid,text,text,text,timestamp with time zone)', 'execute')
    or has_function_privilege('anon', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.complete_staff_notification_push_delivery(uuid,timestamp with time zone,text,text,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.list_staff_notification_push_batch_event_ids(integer)', 'execute') then
    raise exception 'client role can execute a privileged Push RPC';
  end if;

  if has_function_privilege('service_role', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'execute') is false
    or has_function_privilege('service_role', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'execute') is false
    or has_function_privilege('service_role', 'public.complete_staff_notification_push_delivery(uuid,timestamp with time zone,text,text,boolean)', 'execute') is false
    or has_function_privilege('service_role', 'public.list_staff_notification_push_batch_event_ids(integer)', 'execute') is false then
    raise exception 'service role is missing a required Push RPC grant';
  end if;

  update public.staff_notification_preferences
  set push_enabled = true
  where notification_code = 'new_order';

  if public.register_staff_notification_push_subscription(
    '10000000-0000-4000-8000-000000000001',
    'https://fcm.googleapis.com/fcm/send/test-endpoint-a',
    repeat('A', 87), repeat('B', 22), null
  ) is false or public.register_staff_notification_push_subscription(
    '10000000-0000-4000-8000-000000000002',
    'https://fcm.googleapis.com/fcm/send/test-endpoint-b',
    repeat('C', 87), repeat('D', 22), null
  ) is false then
    raise exception 'active staff subscription registration was rejected';
  end if;
  if public.register_staff_notification_push_subscription(
    '10000000-0000-4000-8000-000000000002',
    'https://fcm.googleapis.com/fcm/send/test-endpoint-a',
    repeat('C', 87), repeat('D', 22), null
  ) then raise exception 'subscription endpoint was reassigned to another staff account'; end if;
  if (select staff_id from public.staff_notification_push_subscriptions
      where endpoint='https://fcm.googleapis.com/fcm/send/test-endpoint-a')
      <> '10000000-0000-4000-8000-000000000001' then
    raise exception 'subscription owner changed after rejected reassignment';
  end if;

  insert into public.staff_notification_events (id, code, created_at) values
    ('30000000-0000-4000-8000-000000000001', 'new_order', clock_timestamp()),
    ('30000000-0000-4000-8000-000000000002', 'new_order', clock_timestamp());

  v_count := public.queue_staff_notification_push_deliveries(
    '30000000-0000-4000-8000-000000000001', 10
  );
  if v_count <> 2 then raise exception 'event-scoped queue expected 2 rows, got %', v_count; end if;
  if public.queue_staff_notification_push_deliveries(
    '30000000-0000-4000-8000-000000000001', 10
  ) <> 0 then raise exception 'idempotent queue call inserted duplicate deliveries'; end if;
  if public.queue_staff_notification_push_deliveries(
    '30000000-0000-4000-8000-000000000002', 10
  ) <> 2 then raise exception 'second event did not queue its own two deliveries'; end if;

  begin
    perform public.queue_staff_notification_push_deliveries(null, 10);
    raise exception 'null event ID unexpectedly authorized general queue processing';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.claim_staff_notification_push_deliveries(10, null, 120);
    raise exception 'null event ID unexpectedly authorized general claims';
  exception when sqlstate '22023' then null;
  end;

  select count(*), count(*) filter (where event_id = '30000000-0000-4000-8000-000000000001')
    into v_claimed, v_claimed_event_count
  from public.claim_staff_notification_push_deliveries(
    10, '30000000-0000-4000-8000-000000000001', 120
  );
  if v_claimed <> 2 or v_claimed_event_count <> 2 then
    raise exception 'event-scoped claim returned wrong delivery/event count: %, %', v_claimed, v_claimed_event_count;
  end if;

  select d.id, d.claimed_until into v_delivery_id, v_claimed_until
  from public.staff_notification_push_deliveries d
  where d.event_id = '30000000-0000-4000-8000-000000000001'
  order by d.created_at limit 1;
  if public.complete_staff_notification_push_delivery(
    v_delivery_id, v_claimed_until + interval '1 second', 'sent', null, false
  ) then raise exception 'stale lease unexpectedly completed a delivery'; end if;
  if public.complete_staff_notification_push_delivery(
    v_delivery_id, v_claimed_until, 'failed', 'transport_error', false
  ) is false then raise exception 'current lease completion failed'; end if;
  if not exists (
    select 1 from public.staff_notification_push_deliveries
    where id = v_delivery_id and status = 'failed'
      and attempt_count = 1 and next_attempt_at > now()
  ) then raise exception 'retry state was not recorded with bounded attempt count'; end if;

  select count(*) into v_batch_event_count
  from public.list_staff_notification_push_batch_event_ids(10) b
  where b.event_id = '30000000-0000-4000-8000-000000000002';
  if v_batch_event_count <> 1 then raise exception 'explicit batch listing omitted independent eligible event'; end if;
  if exists (
    select 1 from public.list_staff_notification_push_batch_event_ids(10)
    where event_id = '30000000-0000-4000-8000-000000000001'
  ) then raise exception 'batch listing included in-flight deliveries with future leases'; end if;

  update public.staff_profiles
  set role_id = '20000000-0000-4000-8000-000000000002'
  where id = '10000000-0000-4000-8000-000000000002';
  if exists (
    select 1 from public.staff_notification_preferences
    where staff_id = '10000000-0000-4000-8000-000000000002' and push_enabled
  ) then raise exception 'role change did not disable Push preference'; end if;
  if exists (
    select 1 from public.staff_notification_push_subscriptions
    where staff_id = '10000000-0000-4000-8000-000000000002' and revoked_at is null
  ) then raise exception 'role change did not revoke device subscription'; end if;

  insert into public.staff_notification_events (id, code, created_at)
  values ('30000000-0000-4000-8000-000000000003', 'new_order', clock_timestamp());
  if public.queue_staff_notification_push_deliveries(
    '30000000-0000-4000-8000-000000000003', 10
  ) <> 1 then raise exception 'inactive/role-changed staff remained Push eligible'; end if;
end;
$$;

do $$
declare
  v_current_event uuid := '30000000-0000-4000-8000-000000000004';
  v_stale_event uuid := '30000000-0000-4000-8000-000000000005';
  v_other_stale_event uuid := '30000000-0000-4000-8000-000000000006';
  v_delivery_id uuid;
  v_claimed_until timestamptz;
  v_count integer;
begin
  if not has_function_privilege('service_role', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE')
    or has_function_privilege('anon', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE') then
    raise exception 'pre-existing Fresh Pick Push RPCs or service-role grants changed';
  end if;

  update public.staff_notification_preferences
  set push_enabled = true
  where staff_id = '10000000-0000-4000-8000-000000000001'
    and notification_code = 'fresh_pick_walk_in_hold_reminder';

  insert into public.staff_notification_events (id, code, payload, created_at) values
    (v_current_event, 'fresh_pick_walk_in_hold_reminder', '{"fixture_hold_current":true}', clock_timestamp()),
    (v_stale_event, 'fresh_pick_walk_in_hold_reminder', '{"fixture_hold_current":false}', clock_timestamp()),
    (v_other_stale_event, 'fresh_pick_walk_in_hold_reminder', '{"fixture_hold_current":false}', clock_timestamp());

  if (select count(*) from public.list_due_fresh_pick_hold_reminder_push_event_ids(20) where event_id = v_current_event) <> 1
    or exists (select 1 from public.list_due_fresh_pick_hold_reminder_push_event_ids(20) where event_id in (v_stale_event, v_other_stale_event)) then
    raise exception 'legacy Fresh Pick due-event listing no longer filters current holds';
  end if;
  if not exists (select 1 from public.list_staff_notification_push_batch_event_ids(50) where event_id = v_current_event)
    or exists (select 1 from public.list_staff_notification_push_batch_event_ids(50) where event_id in (v_stale_event, v_other_stale_event)) then
    raise exception 'new bounded batch listing did not preserve Fresh Pick current-hold filtering';
  end if;

  if public.queue_staff_notification_push_deliveries(v_current_event, 10) <> 1
    or public.queue_staff_notification_push_deliveries(v_current_event, 10) <> 0
    or public.queue_staff_notification_push_deliveries(v_stale_event, 10) <> 0 then
    raise exception 'event queue did not retain Fresh Pick eligibility and idempotency';
  end if;

  insert into public.staff_notification_push_deliveries (event_id, staff_id, subscription_id, status)
  values
    (v_stale_event, '10000000-0000-4000-8000-000000000001',
      (select id from public.staff_notification_push_subscriptions where endpoint like '%test-endpoint-a' limit 1), 'pending'),
    (v_other_stale_event, '10000000-0000-4000-8000-000000000001',
      (select id from public.staff_notification_push_subscriptions where endpoint like '%test-endpoint-a' limit 1), 'pending');

  select count(*) into v_count
  from public.claim_staff_notification_push_deliveries(10, v_current_event, 120);
  if v_count <> 1 then raise exception 'current Fresh Pick event did not claim its eligible delivery'; end if;
  if (select count(*) from public.staff_notification_push_deliveries
      where event_id in (v_stale_event, v_other_stale_event) and status = 'pending') <> 2 then
    raise exception 'event-scoped claim modified another event’s stale Fresh Pick delivery';
  end if;

  select count(*) into v_count
  from public.claim_staff_notification_push_deliveries(10, v_stale_event, 120);
  if v_count <> 0 then raise exception 'stale Fresh Pick event was claimed'; end if;
  if not exists (select 1 from public.staff_notification_push_deliveries
      where event_id = v_stale_event and status = 'suppressed' and error_code = 'stale_hold') then
    raise exception 'stale event delivery was not terminally suppressed';
  end if;
  if not exists (select 1 from public.staff_notification_push_deliveries
      where event_id = v_other_stale_event and status = 'pending') then
    raise exception 'stale suppression escaped its selected event scope';
  end if;

  update public.staff_notification_push_deliveries
  set status = 'claimed', claimed_until = clock_timestamp() + interval '60 seconds', attempt_count = 2
  where event_id = v_other_stale_event;
  select id, claimed_until into v_delivery_id, v_claimed_until
  from public.staff_notification_push_deliveries where event_id = v_other_stale_event;
  if public.complete_staff_notification_push_delivery(v_delivery_id, v_claimed_until, 'suppressed', 'wrong_reason', false) then
    raise exception 'Fresh Pick suppression accepted a non-stale reason';
  end if;
  if public.complete_staff_notification_push_delivery(v_delivery_id, v_claimed_until, 'suppressed', 'stale_hold', false) is false then
    raise exception 'Fresh Pick stale-hold completion was rejected';
  end if;
  if not exists (select 1 from public.staff_notification_push_deliveries
      where id = v_delivery_id and status = 'suppressed' and error_code = 'stale_hold' and attempt_count = 2 and next_attempt_at is null) then
    raise exception 'suppressed Fresh Pick delivery did not remain terminal without consuming another attempt';
  end if;
end $$;

select 'fresh_pick_compatibility_assertions=12';

select 'assertions=21';
