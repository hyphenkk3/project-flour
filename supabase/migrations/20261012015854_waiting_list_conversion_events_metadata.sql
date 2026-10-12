-- The conversion function tracks previously converted quantities from event
-- JSON. DEV's waiting_list_events schema stores that JSON in metadata.
-- Preserve the installed function definition and ACLs, changing only the
-- incorrect event-column reference after verifying the reviewed call surface.
do $fix$
declare
  v_function_oid oid;
  v_function_source text;
  v_function_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waiting_list_events'
      and column_name = 'metadata'
      and udt_name = 'jsonb'
  ) then
    raise exception 'Expected public.waiting_list_events.metadata jsonb column; stop and reconcile';
  end if;

  select p.oid, p.prosrc, pg_catalog.pg_get_functiondef(p.oid)
  into v_function_oid, v_function_source, v_function_definition
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.waiting_list_convert_item(uuid, uuid, integer, time, boolean)'
  )
    and p.prosecdef
    and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres';

  if v_function_oid is null
    or length(v_function_source) - length(replace(v_function_source, 'e.payload', ''))
      <> 2 * length('e.payload')
    or position('auth.uid()' in v_function_source) = 0
    or position('_waiting_list_assert_manage_staff' in v_function_source) = 0
    or position('accepted_quantity' in v_function_source) = 0 then
    raise exception 'Unreviewed waiting_list_convert_item definition; stop and reconcile';
  end if;

  if length(v_function_definition) - length(replace(v_function_definition, 'e.payload', ''))
      <> 2 * length('e.payload') then
    raise exception 'Unexpected waiting-list event reference count; stop and reconcile';
  end if;

  execute replace(v_function_definition, 'e.payload', 'e.metadata');
end
$fix$;
