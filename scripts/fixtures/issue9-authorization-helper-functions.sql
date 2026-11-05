CREATE OR REPLACE FUNCTION public._bind_rpc_actor(p_claimed_staff_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_staff_id uuid;
  v_active boolean;
begin
  v_uid := auth.uid();

  if v_uid is null then
    if auth.role() is distinct from 'service_role' then
      raise exception 'Not authenticated';
    end if;
    if p_claimed_staff_id is null then
      raise exception 'Staff actor is required';
    end if;

    select sp.id, sp.is_active
    into v_staff_id, v_active
    from public.staff_profiles sp
    where sp.id = p_claimed_staff_id
      and sp.archived_at is null;

    if v_staff_id is null then
      raise exception 'Staff actor not found';
    end if;
    if v_active is distinct from true then
      raise exception 'Not authorized';
    end if;
    return v_staff_id;
  end if;

  select sp.id
  into v_staff_id
  from public.staff_profiles sp
  where sp.auth_user_id = v_uid
    and sp.is_active is distinct from false
    and sp.archived_at is null;

  if v_staff_id is null then
    raise exception 'Not authorized';
  end if;

  if p_claimed_staff_id is not null
     and p_claimed_staff_id is distinct from v_staff_id then
    raise exception 'Not authorized';
  end if;

  return v_staff_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._require_rpc_roles(p_staff_id uuid, p_roles text[], p_message text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  v_role := public._staff_role_code(p_staff_id);
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception '%', coalesce(nullif(trim(p_message), ''), 'Not authorized');
  end if;
end;
$function$;
