-- READ ONLY postflight.
select version,name from supabase_migrations.schema_migrations
where version in ('20261017150000','20261017151000','20261017150500','20261017152000','20261017153000','20261017154000') order by version;
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
