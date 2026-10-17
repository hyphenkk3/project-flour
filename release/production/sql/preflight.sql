-- READ ONLY. Verify the Production project externally before connecting.
-- Intended migrations are matched by API-supplied name, not filename timestamp.
-- A row already present for any intended name is a STOP condition; do not replay.
with intended(name) as (
  values
    ('assignment_fix'),
    ('cut_extra_stock_actor_acl'),
    ('cutoff'),
    ('refund_v1'),
    ('email_pause'),
    ('refund_total_rpc_acl')
)
select i.name,
       count(m.version) as history_rows,
       array_agg(m.version order by m.version)
         filter (where m.version is not null) as actual_versions,
       case count(m.version)
         when 0 then 'NOT APPLIED'
         when 1 then 'ALREADY APPLIED — STOP'
         else 'DUPLICATE HISTORY — STOP'
       end as status
from intended i
left join supabase_migrations.schema_migrations m on m.name = i.name
group by i.name
order by i.name;

-- This candidate is explicitly excluded from initial Production rollout.
select version, name
from supabase_migrations.schema_migrations
where name = 'refund_v1_write_lock'
order by version;

select current_database(), current_setting('server_version');
select to_regprocedure('public._bind_rpc_actor(uuid)') is not null actor_binder,
 to_regprocedure('public._staff_role_code(uuid)') is not null role_helper,
 to_regprocedure('public.assign_extra_stock_to_order(uuid,uuid,uuid)') is not null assignment_rpc,
 to_regprocedure('public._pickup_slot_in_weekly_hours(date,time without time zone)') is not null pickup_helper,
 to_regclass('public.refunds') is not null refunds_table,
 to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)') is not null cut_slices_rpc,
 to_regprocedure('public._record_extra_stock_event(uuid,text,uuid,jsonb)') is not null stock_audit_helper;
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
