-- EXTRA Activation v1 — rejection hardening (additive).
-- Required trimmed reject_reason; Undo Reject restores proposed on the same row.
-- Do not rewrite 20260813160000_extra_activation_v1.sql.

-- ---------------------------------------------------------------------------
-- 1) reject_extra_stock — require non-empty trimmed reason
-- ---------------------------------------------------------------------------

create or replace function public.reject_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reject_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_reason text;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to reject EXTRA';
  end if;

  v_reason := nullif(trim(coalesce(p_reject_reason, '')), '');
  if v_reason is null then
    raise exception 'A rejection reason is required';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'proposed' then
    raise exception 'Only proposed EXTRA can be rejected';
  end if;

  update public.extra_stock e
  set
    lifecycle = 'rejected',
    rejected_at = now(),
    rejected_by = p_actor_staff_id,
    reject_reason = v_reason,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.reject_extra_stock(uuid, uuid, text) from public;
grant execute on function public.reject_extra_stock(uuid, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) undo_extra_stock_rejected — same row back to proposed
-- ---------------------------------------------------------------------------

create or replace function public.undo_extra_stock_rejected(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to undo EXTRA rejection';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'rejected' then
    raise exception 'Only rejected EXTRA can be restored';
  end if;

  update public.extra_stock e
  set
    lifecycle = 'proposed',
    rejected_at = null,
    rejected_by = null,
    reject_reason = null,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.undo_extra_stock_rejected(uuid, uuid) from public;
grant execute on function public.undo_extra_stock_rejected(uuid, uuid)
  to authenticated, service_role;
