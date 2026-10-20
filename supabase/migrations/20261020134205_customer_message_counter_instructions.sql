-- Add an independently editable, revision-tracked counter instruction.
-- Keep the historical Whitebird wording as the default; no existing template body is changed.
do $$
begin
  if to_regclass('public.customer_message_templates') is null
     or to_regclass('public.customer_message_template_revisions') is null then
    raise exception 'Customer message template tables are missing';
  end if;

  if (select count(*) from public.customer_message_templates) <> 19 then
    raise exception 'Expected exactly the 19 existing message templates before adding counter instructions';
  end if;

  if exists (
    select 1 from public.customer_message_templates
    where template_key = 'collection_counter_instructions'
  ) then
    raise exception 'Collection counter instructions already exist; inspect state before applying this migration';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'customer_message_templates'
      and c.conname = 'customer_message_templates_template_key_check'
      and c.contype = 'c'
  ) then
    raise exception 'Expected template key allowlist constraint was not found';
  end if;

  if not exists (
    select 1 from public.customer_message_templates
    where template_key = 'ready_pickup'
      and required_placeholders @> array['counter_instruction']::text[]
      and not (required_placeholders @> array['counter_instructions']::text[])
  ) then
    raise exception 'Ready for Pickup required counter_instruction placeholder differs from the approved source';
  end if;
end;
$$;

alter table public.customer_message_templates
  drop constraint customer_message_templates_template_key_check;

alter table public.customer_message_templates
  add constraint customer_message_templates_template_key_check
  check (template_key in (
    'order_confirmation',
    'payment_request_wb_qr_initial',
    'payment_request_wb_qr_outstanding',
    'payment_request_wb_qr_wholecake_preorder',
    'payment_request_online_transfer_initial',
    'payment_request_online_transfer_outstanding',
    'payment_thank_you_pickup',
    'payment_thank_you_dine_in',
    'payment_thank_you_delivery_same_inform',
    'payment_thank_you_delivery_same_do_not_inform',
    'payment_thank_you_delivery_different_inform',
    'payment_thank_you_delivery_different_do_not_inform',
    'ready_pickup',
    'collection_counter_instructions',
    'ready_pickup_closed',
    'delivery_ready_scheduled',
    'delivery_ready_contact_recipient',
    'out_for_delivery',
    'general_thank_you',
    'waiting_list_confirmation'
  ));

insert into public.customer_message_templates (
  template_key,
  category,
  display_name,
  description,
  body,
  default_body,
  allowed_placeholders,
  required_placeholders,
  revision
) values (
  'collection_counter_instructions',
  'Ready for Pickup',
  'Collection Counter Instructions',
  'Customer-facing instructions shown in the shared Ready for Pickup message. Existing wording stays in use until Owner or Manager saves a change.',
  'Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉',
  'Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉',
  '{}'::text[],
  '{}'::text[],
  1
);

insert into public.customer_message_template_revisions (
  template_key,
  revision,
  action,
  previous_body,
  new_body,
  actor_staff_id,
  actor_display_name
) values (
  'collection_counter_instructions',
  1,
  'seed',
  'Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉',
  'Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉',
  null,
  'Whitebird defaults'
);
