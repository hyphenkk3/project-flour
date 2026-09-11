-- Phase 3.x: Master Owner rank (not a new role).
-- is_master_owner defaults false. Do NOT designate any existing staff here.
--
-- Manual DEV bootstrap (reviewed, after this migration is applied):
--   begin;
--   select set_config('app.allow_master_transfer', 'on', true);
--   update public.staff_profiles
--     set is_master_owner = true
--     where id = '<active-owner-staff-uuid>';
--   commit;

alter table public.staff_profiles
  add column if not exists is_master_owner boolean not null default false;

comment on column public.staff_profiles.is_master_owner is
  'Additional rank inside role=owner. At most one true row. Bootstrap is a separate reviewed UPDATE.';

create unique index if not exists staff_profiles_one_master_owner_idx
  on public.staff_profiles (is_master_owner)
  where is_master_owner = true;

-- ---------------------------------------------------------------------------
-- Invariants:
--   Master => Owner role and active
--   is_master_owner may change only when app.allow_master_transfer = on
--     (set locally by transfer_master_owner, or a reviewed bootstrap UPDATE)
-- Clearing the flag is allowed inside that gated path so transfer can flip
-- two rows in one transaction. The unique index permits a temporary
-- zero-Master state between those two UPDATEs; it never permits two Masters.
-- ---------------------------------------------------------------------------

create or replace function public.staff_profiles_enforce_master_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role_code text;
  v_transfer_ok text;
begin
  v_transfer_ok := current_setting('app.allow_master_transfer', true);

  if tg_op = 'INSERT' then
    if new.is_master_owner and v_transfer_ok is distinct from 'on' then
      raise exception 'Master Owner status can only change through transfer';
    end if;
  elsif old.is_master_owner is distinct from new.is_master_owner then
    if v_transfer_ok is distinct from 'on' then
      raise exception 'Master Owner status can only change through transfer';
    end if;
  end if;

  if not new.is_master_owner then
    return new;
  end if;

  if not new.is_active then
    raise exception 'Master Owner must remain active';
  end if;

  select r.code into v_role_code
  from public.roles r
  where r.id = new.role_id;

  if v_role_code is distinct from 'owner' then
    raise exception 'Master Owner must have the Owner role';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_profiles_enforce_master_owner on public.staff_profiles;
create trigger staff_profiles_enforce_master_owner
before insert or update of is_master_owner, is_active, role_id
on public.staff_profiles
for each row
execute function public.staff_profiles_enforce_master_owner();

revoke all on function public.staff_profiles_enforce_master_owner()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic transfer. Called only via service-role after requireStaff().
-- ---------------------------------------------------------------------------

create or replace function public.transfer_master_owner(
  p_actor_staff_id uuid,
  p_new_master_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles;
  v_target public.staff_profiles;
  v_actor_role text;
  v_target_role text;
begin
  perform set_config('app.allow_master_transfer', 'on', true);

  if p_actor_staff_id is null or p_new_master_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if p_actor_staff_id = p_new_master_staff_id then
    raise exception 'Cannot transfer Master Owner to yourself';
  end if;

  perform 1
  from public.staff_profiles
  where id in (p_actor_staff_id, p_new_master_staff_id)
  order by id
  for update;

  select * into v_actor
  from public.staff_profiles
  where id = p_actor_staff_id;

  select * into v_target
  from public.staff_profiles
  where id = p_new_master_staff_id;

  if v_actor.id is null then
    raise exception 'Staff actor not found';
  end if;
  if v_target.id is null then
    raise exception 'Staff member not found';
  end if;

  select r.code into v_actor_role
  from public.roles r
  where r.id = v_actor.role_id;

  select r.code into v_target_role
  from public.roles r
  where r.id = v_target.role_id;

  if not v_actor.is_active
    or not v_actor.is_master_owner
    or v_actor_role is distinct from 'owner'
  then
    raise exception 'Not authorized to transfer Master Owner';
  end if;

  if not v_target.is_active or v_target_role is distinct from 'owner' then
    raise exception 'Transfer target must be an active Owner';
  end if;

  update public.staff_profiles
  set is_master_owner = false
  where id = v_actor.id
    and is_master_owner = true;

  if not found then
    raise exception 'Not authorized to transfer Master Owner';
  end if;

  update public.staff_profiles
  set is_master_owner = true
  where id = v_target.id
    and is_active = true;

  if not found then
    raise exception 'Transfer target must be an active Owner';
  end if;
end;
$$;

comment on function public.transfer_master_owner(uuid, uuid) is
  'Atomically transfer Master Owner rank from the current Master to another active Owner. Service-role only.';

revoke all on function public.transfer_master_owner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_master_owner(uuid, uuid)
  to service_role;
