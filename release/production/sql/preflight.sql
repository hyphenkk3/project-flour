-- READ ONLY: verify project externally before running; no writes in this file.
select current_database(), current_setting('server_version');
select version,name from supabase_migrations.schema_migrations
where version in ('20261017012542','20261017022803','20261017150000','20261017151000','20261017152000','20261017150500','20261017153000','20261017154000')
order by version;
select to_regprocedure('public._bind_rpc_actor(uuid)') is not null actor_binder,
 to_regprocedure('public._staff_role_code(uuid)') is not null role_helper,
 to_regprocedure('public.assign_extra_stock_to_order(uuid,uuid,uuid)') is not null assignment_rpc,
 to_regprocedure('public._pickup_slot_in_weekly_hours(date,time without time zone)') is not null pickup_helper,
 to_regclass('public.refunds') is not null refunds_table,\n to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)') is not null cut_slices_rpc,\n to_regprocedure('public._record_extra_stock_event(uuid,text,uuid,jsonb)') is not null stock_audit_helper;
select column_name from information_schema.columns where table_schema='public' and table_name='refunds'
and column_name in ('refund_method','refund_method_description','request_key','refund_type') order by 1;
select conname,convalidated,pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.extra_stock'::regclass and conname='extra_stock_pickup_from_order_cutoff_fields';
select
 (select count(*) from public.extra_stock e where e.order_id is not null and not exists
   (select 1 from public.orders o where o.id=e.order_id and o.extra_stock_id=e.id)) as stock_to_order_mismatch_count,
 (select count(*) from public.orders o where o.extra_stock_id is not null and not exists
   (select 1 from public.extra_stock e where e.id=o.extra_stock_id and e.order_id=o.id)) as order_to_stock_mismatch_count;
select status,count(*) from public.staff_notification_email_deliveries group by status order by status;
