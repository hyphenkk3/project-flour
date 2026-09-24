-- Physical RM10 voucher identity is numeric. Leading zeroes are insignificant.
-- `0123`, `123`, and `000123` share normalized identity `123`.
-- Updates the existing helper only. Redeem RPC bodies are unchanged.

create or replace function public.normalize_physical_voucher_number(p_number text)
returns text
language sql
immutable
as $$
  select case
    when compact ~ '^[0-9]+$' then nullif(regexp_replace(compact, '^0+', ''), '')
    else nullif(compact, '')
  end
  from (
    select upper(regexp_replace(trim(coalesce(p_number, '')), '\s+', '', 'g')) as compact
  ) normalized;
$$;

comment on function public.normalize_physical_voucher_number(text) is
  'Physical RM10 voucher identity: trim, strip spaces, strip insignificant leading zeroes for digit-only numbers. No WB prefix.';

update public.physical_discount_vouchers v
set voucher_number_normalized = public.normalize_physical_voucher_number(v.voucher_number)
where public.normalize_physical_voucher_number(v.voucher_number) is not null
  and v.voucher_number_normalized is distinct from public.normalize_physical_voucher_number(v.voucher_number)
  and not exists (
    select 1
    from public.physical_discount_vouchers other
    where other.id <> v.id
      and other.voucher_number_normalized = public.normalize_physical_voucher_number(v.voucher_number)
  );
