do $$ begin
  if to_regprocedure('public.mark_guest_order_production_started(uuid,uuid)') is null then
    raise exception 'Expected Start Production RPC is absent';
  end if;
end $$;

revoke execute on function public.mark_guest_order_production_started(uuid,uuid) from public, anon;
grant execute on function public.mark_guest_order_production_started(uuid,uuid) to authenticated, service_role;

do $$ begin
  if has_function_privilege('anon','public.mark_guest_order_production_started(uuid,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.mark_guest_order_production_started(uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.mark_guest_order_production_started(uuid,uuid)','EXECUTE') then
    raise exception 'Start Production RPC privileges did not converge';
  end if;
end $$;
