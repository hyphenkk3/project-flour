-- Waiting List confirmation staff review (Phase C).
-- Staff can list confirmation-link status and submitted details for review.
-- Does not create orders, change accepted quantity, or convert holds.
-- Does not add Waiting List-specific hours, slots, or fulfilment cutoffs.
-- Link expiry remains waiting_list_confirmation_links.expires_at
-- (existing response_deadline_at). Not fulfilment-time minus 30 minutes.
-- Never returns token_hash. Raw token is never stored.

create or replace function public.staff_list_waiting_list_confirmation_links(
  p_actor_staff_id uuid,
  p_request_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  if p_request_ids is null or coalesce(cardinality(p_request_ids), 0) = 0 then
    return v_result;
  end if;

  update public.waiting_list_confirmation_links
  set status = 'expired'
  where request_id = any(p_request_ids)
    and status = 'issued'
    and expires_at <= now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ranked.id,
        'request_id', ranked.request_id,
        'status', ranked.status,
        'expires_at', ranked.expires_at,
        'issued_at', ranked.issued_at,
        'submitted_at', ranked.submitted_at,
        'items', ranked.items,
        'submitted_payload', ranked.submitted_payload
      )
      order by ranked.request_id
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select distinct on (l.request_id)
      l.id,
      l.request_id,
      l.status,
      l.expires_at,
      l.issued_at,
      l.submitted_at,
      case
        when l.status = 'submitted' then l.submitted_payload
        else null
      end as submitted_payload,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'cake_name', c.name,
              'size_label', s.label,
              'quantity', (entry.elem ->> 'offered_quantity')::integer,
              'unit_price', s.price
            )
            order by entry.ordinality
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(l.item_snapshot)
          with ordinality as entry(elem, ordinality)
        join public.library_cakes c
          on c.id = (entry.elem ->> 'cake_id')::uuid
        join public.library_cake_sizes s
          on s.id = (entry.elem ->> 'cake_size_id')::uuid
         and s.cake_id = c.id
      ) as items
    from public.waiting_list_confirmation_links l
    where l.request_id = any(p_request_ids)
    order by
      l.request_id,
      case l.status
        when 'issued' then 0
        when 'submitted' then 1
        else 2
      end,
      l.issued_at desc
  ) ranked;

  return v_result;
end;
$$;

comment on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[]) is
  'Staff review of request-level Waiting List confirmation links. '
  'Does not return token_hash. Does not create an order.';

revoke all on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[])
  from public, anon;
grant execute on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[])
  to authenticated;
