-- Voucher Library: Owner/Manager can pre-register RM10 Physical Cards.
-- Reuses public.physical_discount_vouchers (redemption registry).
-- Does not change redeem / change-to-RM10 RPCs or stored redemption status.
-- Usage in the library UI is derived from effective order_adjustments.

alter table public.physical_discount_vouchers
  add column if not exists library_managed boolean not null default false,
  add column if not exists created_by uuid
    references public.staff_profiles (id) on delete restrict;

comment on column public.physical_discount_vouchers.library_managed is
  'True when Owner/Manager added this card in Voucher Library. False for rows created only by redemption.';

comment on column public.physical_discount_vouchers.created_by is
  'Staff who added the card in Voucher Library. Null for redemption-created rows.';

create index if not exists physical_discount_vouchers_library_managed_idx
  on public.physical_discount_vouchers (library_managed)
  where library_managed = true;

drop policy if exists physical_discount_vouchers_authenticated_select
  on public.physical_discount_vouchers;
drop policy if exists physical_discount_vouchers_authenticated_insert
  on public.physical_discount_vouchers;
drop policy if exists physical_discount_vouchers_authenticated_update
  on public.physical_discount_vouchers;

create policy physical_discount_vouchers_staff_select
  on public.physical_discount_vouchers
  for select
  to authenticated
  using (public._current_staff_role_code() in ('owner', 'manager'));

create policy physical_discount_vouchers_staff_insert
  on public.physical_discount_vouchers
  for insert
  to authenticated
  with check (
    public._current_staff_role_code() in ('owner', 'manager')
    and library_managed = true
    and status = 'unredeemed'
  );

-- No authenticated UPDATE/DELETE. Redemption RPCs remain SECURITY DEFINER.
