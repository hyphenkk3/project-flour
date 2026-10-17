-- READ ONLY postflight. The migration API may generate versions different
-- from filenames; match by supplied migration name and report actual version.
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
       case when count(m.version) = 1 then 'PASS' else 'FAIL — STOP' end as status
from intended i
left join supabase_migrations.schema_migrations m on m.name = i.name
group by i.name
order by i.name;

-- Any row for the excluded write-lock is an unexpected state: STOP.
select version, name
from supabase_migrations.schema_migrations
where name = 'refund_v1_write_lock'
order by version;

select has_function_privilege('anon','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') anon_assign,
 has_function_privilege('authenticated','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') auth_assign,
 has_function_privilege('service_role','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') service_assign,
 to_regprocedure('public.update_extra_stock_order_cutoff(uuid,uuid,timestamp with time zone,boolean)') is not null cutoff_rpc,
 to_regprocedure('public.record_order_refund(uuid,numeric,text,text,date,text,uuid)') is not null refund_rpc,
 public.staff_notification_email_delivery_is_paused() email_pause,
 to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)') is not null cut_slices_rpc,
 has_function_privilege('anon','public.cut_extra_stock_into_slices(uuid,uuid)','EXECUTE') anon_cut_slices,
 has_function_privilege('authenticated','public.cut_extra_stock_into_slices(uuid,uuid)','EXECUTE') auth_cut_slices,
 has_function_privilege('service_role','public.cut_extra_stock_into_slices(uuid,uuid)','EXECUTE') service_cut_slices,
 (select p.prosecdef from pg_proc p where p.oid=to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)')) cut_slices_security_definer,
 (select pg_get_functiondef(p.oid) ~* '_bind_rpc_actor' from pg_proc p where p.oid=to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)')) cut_slices_binds_actor;
select column_name from information_schema.columns where table_schema='public' and table_name='refunds'
and column_name in ('refund_method','refund_method_description','request_key') order by 1;
select status,count(*) from public.staff_notification_email_deliveries group by status order by status;
