-- Repair the already-installed Payment Correction RPC without rewriting the
-- original migration or changing its settlement/status behavior.
do $$
declare
  v_definition text;
  v_old_expression text :=
    'payment_status = case when v_new_status = ''paid'' then ''paid'' else ''unpaid'' end,';
  v_new_expression text :=
    'payment_status = case when v_new_status = ''paid'' then ''paid''::public.payment_status else ''unpaid''::public.payment_status end,';
begin
  v_definition := pg_get_functiondef(
    'public.record_payment_correction(uuid, uuid, numeric, text, text, text, uuid)'::regprocedure
  );

  if position(v_new_expression in v_definition) > 0 then
    return;
  end if;

  if position(v_old_expression in v_definition) = 0 then
    raise exception 'Expected Payment Correction payment_status expression was not found';
  end if;

  execute replace(v_definition, v_old_expression, v_new_expression);
end;
$$;
