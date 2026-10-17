-- Apply only after exact Production application and every refund writer
-- are confirmed to use these RPCs and not direct table DML.
do $preflight$
begin
 if to_regprocedure('public.record_order_refund(uuid,numeric,text,text,date,text,uuid)') is null
 or to_regprocedure('public.record_overpayment_refund_with_details(uuid,numeric,text,uuid,jsonb,text,text,date,uuid)') is null
 or to_regprocedure('public.cancel_and_refund_paid_fresh_pick_with_details(uuid,uuid,text,text,text,date)') is null then
 raise exception 'Refund write lock precondition failed: metadata-aware RPCs absent';
 end if;
end
$preflight$;
drop policy if exists refunds_authenticated_insert on public.refunds;
revoke insert, update, delete, truncate, references, trigger
 on table public.refunds from public, anon, authenticated, service_role;
grant select on table public.refunds to authenticated;
