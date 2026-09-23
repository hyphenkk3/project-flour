-- Staff overpayment correction uses the existing public.refunds table.
-- Additive records only. Does not rewrite payments or payment_allocations.
-- Does not move money through a payment gateway.

comment on table public.refunds is
  'Operational payment corrections (overpayment refunds). '
  'Additive recorded facts. Historical payments stay immutable.';

drop policy if exists refunds_authenticated_insert on public.refunds;
create policy refunds_authenticated_insert
  on public.refunds
  for insert
  to authenticated
  with check (
    public._current_staff_role_code() in ('owner', 'manager')
    and created_by is not null
  );

create or replace function public.assert_refund_within_overpayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(10, 2);
begin
  if NEW.amount is null or NEW.amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  if public.order_verified_allocated(NEW.order_id) <= 0 then
    raise exception 'This order has no verified payment to correct';
  end if;

  v_remaining := greatest(
    public.order_verified_allocated(NEW.order_id)
      - public.order_amount_due(NEW.order_id)
      - public.order_refunds_total(NEW.order_id),
    0
  )::numeric(10, 2);

  if NEW.amount > v_remaining then
    raise exception 'Refund exceeds remaining overpayment';
  end if;

  return NEW;
end;
$$;

drop trigger if exists refunds_assert_within_overpayment on public.refunds;
create trigger refunds_assert_within_overpayment
before insert on public.refunds
for each row
execute function public.assert_refund_within_overpayment();

revoke all on function public.assert_refund_within_overpayment() from public;
