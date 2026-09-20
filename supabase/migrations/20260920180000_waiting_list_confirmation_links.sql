-- Waiting List confirmation-link foundation (Phase A).
-- Request-level, hashed, one-time links bounded by existing response_deadline_at.
-- Does not create orders, fulfilment UI, or a Waiting List-specific calendar.
-- Future confirmation submissions must reuse existing slot validators
-- (is_valid_public_pickup_slot / is_valid_delivery_slot / is_valid_dine_in_slot)
-- and existing operating-hours last-bookable rules. Link expiry is NOT
-- fulfilment-time minus 30 minutes.

create table if not exists public.waiting_list_confirmation_links (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.waiting_list_requests (id) on delete cascade,
  token_hash text not null,
  status text not null default 'issued',
  expires_at timestamptz not null,
  issued_at timestamptz not null default now(),
  issued_by_staff_id uuid not null
    references public.staff_profiles (id) on delete restrict,
  submitted_at timestamptz,
  item_snapshot jsonb not null,
  submitted_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_confirmation_links_token_hash_sha256
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint waiting_list_confirmation_links_status_check
    check (
      status in ('issued', 'submitted', 'expired', 'invalidated')
    ),
  constraint waiting_list_confirmation_links_snapshot_is_array
    check (
      jsonb_typeof(item_snapshot) = 'array'
      and jsonb_array_length(item_snapshot) >= 1
    ),
  constraint waiting_list_confirmation_links_submitted_consistent
    check (
      (status = 'submitted' and submitted_at is not null)
      or (status <> 'submitted' and submitted_at is null)
    )
);

comment on table public.waiting_list_confirmation_links is
  'Hashed one-time Waiting List confirmation links. Raw token is never stored. '
  'expires_at is the existing Waiting List response_deadline_at, not a fulfilment cutoff.';

comment on column public.waiting_list_confirmation_links.token_hash is
  'SHA-256 hex digest of the raw confirmation token. The raw token is not stored.';

comment on column public.waiting_list_confirmation_links.expires_at is
  'Copied from the authoritative waiting_list_items.response_deadline_at of the offered items.';

comment on column public.waiting_list_confirmation_links.item_snapshot is
  'Exact offered items at issuance: waiting_list_item_id, cake_id, cake_size_id, offered_quantity.';

comment on column public.waiting_list_confirmation_links.submitted_payload is
  'Later customer fulfilment/options payload. Not written in Phase A.';

create unique index if not exists waiting_list_confirmation_links_token_hash_uidx
  on public.waiting_list_confirmation_links (token_hash);

create unique index if not exists waiting_list_confirmation_links_one_issued_per_request_idx
  on public.waiting_list_confirmation_links (request_id)
  where status = 'issued';

create index if not exists waiting_list_confirmation_links_request_idx
  on public.waiting_list_confirmation_links (request_id, issued_at desc);

drop trigger if exists waiting_list_confirmation_links_set_updated_at
  on public.waiting_list_confirmation_links;
create trigger waiting_list_confirmation_links_set_updated_at
before update on public.waiting_list_confirmation_links
for each row
execute function public.set_updated_at();

alter table public.waiting_list_confirmation_links enable row level security;

revoke all on table public.waiting_list_confirmation_links
  from public, anon, authenticated;

-- No anon/authenticated table privileges and no SELECT policies.
-- Customers cannot enumerate rows. Staff writes go through security-definer RPCs.

create or replace function public.issue_waiting_list_confirmation_link(
  p_actor_staff_id uuid,
  p_request_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.waiting_list_requests;
  v_item public.waiting_list_items;
  v_hold public.production_capacity_holds;
  v_snapshot jsonb := '[]'::jsonb;
  v_expires_at timestamptz;
  v_link public.waiting_list_confirmation_links;
  v_count integer := 0;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  if p_request_id is null then
    raise exception 'Waiting-list request is required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Confirmation token hash is invalid';
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Waiting-list request not found';
  end if;
  if v_request.status in ('cancelled', 'closed', 'converted') then
    raise exception 'This waiting-list request is no longer eligible for confirmation';
  end if;

  update public.waiting_list_confirmation_links
  set status = 'expired'
  where request_id = p_request_id
    and status = 'issued'
    and expires_at <= now();

  if exists (
    select 1
    from public.waiting_list_confirmation_links
    where request_id = p_request_id
      and status = 'issued'
  ) then
    raise exception 'A confirmation link is already issued for this request';
  end if;

  for v_item in
    select i.*
    from public.waiting_list_items i
    where i.request_id = p_request_id
      and i.status = 'contacted'
    order by i.created_at
    for update
  loop
    if v_item.response_deadline_at is null then
      raise exception 'Waiting-list response deadline is required';
    end if;
    if v_item.response_deadline_at <= now() then
      raise exception 'The waiting-list response deadline has passed';
    end if;

    select h.*
    into v_hold
    from public.production_capacity_holds h
    where h.waiting_list_item_id = v_item.id
      and h.status = 'active'
    order by h.held_at desc
    limit 1
    for update;
    if not found then
      raise exception 'An offered item is missing an active production hold';
    end if;
    if v_hold.held_until <= now() then
      raise exception 'The offered hold has expired';
    end if;
    if v_hold.quantity < 1 then
      raise exception 'Offered quantity must be at least 1';
    end if;
    if v_hold.quantity > v_item.remaining_quantity then
      raise exception 'Offered quantity exceeds the remaining Waiting List quantity';
    end if;
    if v_item.library_cake_id is null or v_item.library_cake_size_id is null then
      raise exception 'Each offered item needs a cake and size';
    end if;

    v_snapshot := v_snapshot || jsonb_build_array(
      jsonb_build_object(
        'waiting_list_item_id', v_item.id,
        'cake_id', v_item.library_cake_id,
        'cake_size_id', v_item.library_cake_size_id,
        'offered_quantity', v_hold.quantity
      )
    );
    v_count := v_count + 1;
    if v_expires_at is null or v_item.response_deadline_at < v_expires_at then
      v_expires_at := v_item.response_deadline_at;
    end if;
  end loop;

  if v_count < 1 then
    raise exception 'No offered Waiting List items are ready for a confirmation link';
  end if;
  if v_expires_at is null then
    raise exception 'Waiting-list response deadline is required';
  end if;
  if v_expires_at <= now() then
    raise exception 'The waiting-list response deadline has passed';
  end if;

  insert into public.waiting_list_confirmation_links (
    request_id,
    token_hash,
    status,
    expires_at,
    issued_by_staff_id,
    item_snapshot
  ) values (
    p_request_id,
    p_token_hash,
    'issued',
    v_expires_at,
    p_actor_staff_id,
    v_snapshot
  )
  returning * into v_link;

  perform public._waiting_list_append_event(
    p_request_id,
    null,
    'confirmation_link_issued',
    p_actor_staff_id,
    jsonb_build_object(
      'confirmation_link_id', v_link.id,
      'expires_at', v_expires_at,
      'item_count', v_count
    )
  );

  return jsonb_build_object(
    'id', v_link.id,
    'request_id', v_link.request_id,
    'expires_at', v_link.expires_at,
    'item_snapshot', v_link.item_snapshot
  );
end;
$$;

create or replace function public.invalidate_waiting_list_confirmation_links(
  p_actor_staff_id uuid,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  if p_request_id is null then
    raise exception 'Waiting-list request is required';
  end if;

  update public.waiting_list_confirmation_links
  set status = 'invalidated'
  where request_id = p_request_id
    and status = 'issued';

  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform public._waiting_list_append_event(
      p_request_id,
      null,
      'confirmation_link_invalidated',
      p_actor_staff_id,
      jsonb_build_object('invalidated_count', v_count)
    );
  end if;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.issue_waiting_list_confirmation_link(uuid, uuid, text)
  from public, anon;
grant execute on function public.issue_waiting_list_confirmation_link(uuid, uuid, text)
  to authenticated;

revoke all on function public.invalidate_waiting_list_confirmation_links(uuid, uuid)
  from public, anon;
grant execute on function public.invalidate_waiting_list_confirmation_links(uuid, uuid)
  to authenticated;
