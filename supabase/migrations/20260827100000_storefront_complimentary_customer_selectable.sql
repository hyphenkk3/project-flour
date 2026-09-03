-- Make storefront complimentary options catalogue-driven.
-- Customers only see items that are both available and customer-selectable.

create or replace function public.storefront_customer_preorder_options(
  p_collection_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_complimentary jsonb;
  v_paid jsonb;
begin
  if p_collection_id is null then
    return jsonb_build_object(
      'complimentary', '[]'::jsonb,
      'paidAddons', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'typeId', cit.id,
        'code', cit.code,
        'name', cit.name,
        'sortOrder', cci.sort_order
      )
      order by cci.sort_order, cit.name
    ),
    '[]'::jsonb
  )
  into v_complimentary
  from public.collection_complimentary_items cci
  join public.complimentary_item_types cit
    on cit.id = cci.complimentary_item_type_id
  where cci.collection_id = p_collection_id
    and cci.is_available = true
    and cci.customer_selectable = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', t.code,
        'name', t.name,
        'unitPrice', t.unit_price,
        'financialShorthand', t.financial_shorthand,
        'sortOrder', t.sort_order
      )
      order by t.sort_order, t.code
    ),
    '[]'::jsonb
  )
  into v_paid
  from public.paid_addon_types t
  where t.is_active = true
    and t.code in ('birthday_card', 'wishing_card');

  return jsonb_build_object(
    'complimentary', coalesce(v_complimentary, '[]'::jsonb),
    'paidAddons', coalesce(v_paid, '[]'::jsonb)
  );
end;
$$;

comment on function public.storefront_customer_preorder_options(uuid) is
  'Public Whole Cake options driven by catalogue configuration. '
  'Complimentary items are exposed only when available and customer-selectable. '
  'Paid Birthday Card / Wishing Card add-ons remain active catalog prices.';

revoke all on function public.storefront_customer_preorder_options(uuid) from public;

grant execute on function public.storefront_customer_preorder_options(uuid)
  to anon, authenticated;
