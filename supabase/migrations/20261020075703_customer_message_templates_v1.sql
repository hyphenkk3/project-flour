-- Customer Message Templates V1. Scoped to dedicated tables and RPCs.
create table public.customer_message_templates (
  template_key text primary key check (template_key in ('order_confirmation','payment_request_wb_qr_initial','payment_request_wb_qr_outstanding','payment_request_wb_qr_wholecake_preorder','payment_request_online_transfer_initial','payment_request_online_transfer_outstanding','payment_thank_you_pickup','payment_thank_you_dine_in','payment_thank_you_delivery_same_inform','payment_thank_you_delivery_same_do_not_inform','payment_thank_you_delivery_different_inform','payment_thank_you_delivery_different_do_not_inform','ready_pickup','ready_pickup_closed','delivery_ready_scheduled','delivery_ready_contact_recipient','out_for_delivery','general_thank_you','waiting_list_confirmation')),
  category text not null,
  display_name text not null,
  description text not null,
  body text not null,
  default_body text not null,
  allowed_placeholders text[] not null default '{}',
  required_placeholders text[] not null default '{}',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz,
  updated_by uuid references public.staff_profiles(id) on delete set null
);

create table public.customer_message_template_revisions (
  id bigint generated always as identity primary key,
  template_key text not null references public.customer_message_templates(template_key) on delete cascade,
  revision integer not null check (revision > 0),
  action text not null check (action in ('seed','save','reset','restore')),
  previous_body text not null,
  new_body text not null,
  actor_staff_id uuid references public.staff_profiles(id) on delete set null,
  actor_display_name text not null,
  created_at timestamptz not null default now(),
  unique (template_key, revision)
);

alter table public.customer_message_templates enable row level security;
alter table public.customer_message_template_revisions enable row level security;
revoke all on public.customer_message_templates from anon, authenticated;
revoke all on public.customer_message_template_revisions from anon, authenticated;
grant select on public.customer_message_templates to authenticated;
grant select on public.customer_message_template_revisions to authenticated;

create or replace function public.customer_message_templates_is_active_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and sp.archived_at is null
  );
$$;

create or replace function public.customer_message_templates_can_manage()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and sp.archived_at is null
      and r.code in ('owner', 'manager')
  );
$$;

revoke all on function public.customer_message_templates_is_active_staff() from public, anon;
revoke all on function public.customer_message_templates_can_manage() from public, anon;
grant execute on function public.customer_message_templates_is_active_staff() to authenticated;
grant execute on function public.customer_message_templates_can_manage() to authenticated;

create policy customer_message_templates_active_staff_read
on public.customer_message_templates for select to authenticated
using (public.customer_message_templates_is_active_staff());

create policy customer_message_template_revisions_manager_read
on public.customer_message_template_revisions for select to authenticated
using (public.customer_message_templates_can_manage());

insert into public.customer_message_templates
  (template_key, category, display_name, description, body, default_body,
   allowed_placeholders, required_placeholders, revision)
values
  ('order_confirmation', 'Order Confirmation', 'Order Confirmation', 'Customer-facing confirmation generated from the current order. Essential order, fulfilment and financial details are inserted as a protected block.', 'Hello {{staff_name}} here,

We''ve received your cakes preorder submission via online system. ;)

Here''s the order confirmation.

──────────

{{order_details}}

──────────

Kindly review ALL the details in this confirmation carefully, as your order will be prepared based on the information provided above.

Once confirmed, any amendments or errors will not be our responsibility.
Important: Voucher orders are final and cannot be amended under any circumstances.

We will proceed with payment once everything is confirmed 😊', 'Hello {{staff_name}} here,

We''ve received your cakes preorder submission via online system. ;)

Here''s the order confirmation.

──────────

{{order_details}}

──────────

Kindly review ALL the details in this confirmation carefully, as your order will be prepared based on the information provided above.

Once confirmed, any amendments or errors will not be our responsibility.
Important: Voucher orders are final and cannot be amended under any circumstances.

We will proceed with payment once everything is confirmed 😊', array['staff_name','order_details']::text[], array['staff_name','order_details']::text[], 1),
  ('payment_request_wb_qr_initial', 'Payment Request', 'Payment Request — Whitebird QR (Initial)', 'First payment request using the standard Whitebird QR. Amount and payment instructions remain application-controlled.', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{slip_instruction}}', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{slip_instruction}}', array['amount_block','payment_instruction','slip_instruction']::text[], array['amount_block','payment_instruction','slip_instruction']::text[], 1),
  ('payment_request_wb_qr_outstanding', 'Payment Request', 'Payment Request — Whitebird QR (Outstanding Balance)', 'Follow-up request for the calculated outstanding balance using the standard Whitebird QR.', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{slip_instruction}}', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{slip_instruction}}', array['amount_block','payment_instruction','slip_instruction']::text[], array['amount_block','payment_instruction','slip_instruction']::text[], 1),
  ('payment_request_wb_qr_wholecake_preorder', 'Payment Request', 'Payment Request — Wholecake Preorder QR', 'Wholecake-preorder QR scenario. QR scope and payment-slip instructions are protected application blocks.', 'Thank you for confirming. ;)

Here are the payment details:

{{amount_block}}

{{payment_instructions}}

{{slip_instruction}}', 'Thank you for confirming. ;)

Here are the payment details:

{{amount_block}}

{{payment_instructions}}

{{slip_instruction}}', array['amount_block','payment_instructions','slip_instruction']::text[], array['amount_block','payment_instructions','slip_instruction']::text[], 1),
  ('payment_request_online_transfer_initial', 'Payment Request', 'Payment Request — Online Transfer (Initial)', 'First payment request by online bank transfer. Payment destination and amount block are structured and protected.', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_destination}}

{{slip_instruction}}', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_destination}}

{{slip_instruction}}', array['amount_block','payment_destination','slip_instruction']::text[], array['amount_block','payment_destination','slip_instruction']::text[], 1),
  ('payment_request_online_transfer_outstanding', 'Payment Request', 'Payment Request — Online Transfer (Outstanding Balance)', 'Follow-up bank transfer request for the calculated outstanding balance.', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{payment_destination}}

{{slip_instruction}}', 'Thank you for confirming. ;)

Here are the payment details.

{{amount_block}}

{{payment_instruction}}

{{payment_destination}}

{{slip_instruction}}', array['amount_block','payment_instruction','payment_destination','slip_instruction']::text[], array['amount_block','payment_instruction','payment_destination','slip_instruction']::text[], 1),
  ('payment_thank_you_pickup', 'Payment Thank You', 'Payment Thank You — Pickup', 'Shown after a verified payment allocation for a pickup order.', 'Thank you for your payment!

In case someone is picking up on your behalf please make sure that him/her knows that it’s under whose order and the contents of the order to avoid mishandling of the cake ya. 🙏😬

Thank you and see you soon! ❤️', 'Thank you for your payment!

In case someone is picking up on your behalf please make sure that him/her knows that it’s under whose order and the contents of the order to avoid mishandling of the cake ya. 🙏😬

Thank you and see you soon! ❤️', array[]::text[], array[]::text[], 1),
  ('payment_thank_you_dine_in', 'Payment Thank You', 'Payment Thank You — Dine-in', 'Shown after a verified payment allocation for a dine-in order.', 'Thank you for your payment!

Kindly inform our crew on the day when you want the cake being served and we will take care of the rest ya. ☺️

Thank you and see you soon! ❤️', 'Thank you for your payment!

Kindly inform our crew on the day when you want the cake being served and we will take care of the rest ya. ☺️

Thank you and see you soon! ❤️', array[]::text[], array[]::text[], 1),
  ('payment_thank_you_delivery_same_inform', 'Payment Thank You', 'Payment Thank You — Delivery (Same Recipient, Inform)', 'Delivery thank-you for the same orderer/recipient when the existing notification preference permits informing them.', 'Thank you for your payment!

We will inform you before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', 'Thank you for your payment!

We will inform you before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', array[]::text[], array[]::text[], 1),
  ('payment_thank_you_delivery_same_do_not_inform', 'Payment Thank You', 'Payment Thank You — Delivery (Same Recipient, No Notification)', 'Delivery thank-you for the same orderer/recipient when the current preference is do not inform.', 'Thank you for your payment!

Your delivery is arranged as confirmed.

Thank you and see you soon! ❤️', 'Thank you for your payment!

Your delivery is arranged as confirmed.

Thank you and see you soon! ❤️', array[]::text[], array[]::text[], 1),
  ('payment_thank_you_delivery_different_inform', 'Payment Thank You', 'Payment Thank You — Delivery (Different Recipient, Inform)', 'Delivery thank-you when the recipient differs and the existing notification preference permits messaging them.', 'Thank you for your payment!

We will inform you and also message recipient before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', 'Thank you for your payment!

We will inform you and also message recipient before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', array[]::text[], array[]::text[], 1),
  ('payment_thank_you_delivery_different_do_not_inform', 'Payment Thank You', 'Payment Thank You — Delivery (Different Recipient, No Notification)', 'Delivery thank-you when the recipient differs but the existing preference is do not inform. Recipient routing remains application-controlled.', 'Thank you for your payment!

We will inform you before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', 'Thank you for your payment!

We will inform you before delivery on that day ya!

Once we’ve arrange grab we will send you the grab link as well as photo for your reference ;)', array[]::text[], array[]::text[], 1),
  ('ready_pickup', 'Ready for Pickup', 'Ready for Pickup', 'Shared by Order and Collection workspaces for the standard pickup-ready message. Required pickup instructions remain protected blocks.', 'Good morning, {{sender_name}} here ☀️
{{ready_notice}}
{{counter_instruction}}

{{grabexpress_instruction}}

{{car_plate_instruction}}

{{pickup_hours}}

{{closing_remarks}}', 'Good morning, {{sender_name}} here ☀️
{{ready_notice}}
{{counter_instruction}}

{{grabexpress_instruction}}

{{car_plate_instruction}}

{{pickup_hours}}

{{closing_remarks}}', array['sender_name','ready_notice','counter_instruction','grabexpress_instruction','car_plate_instruction','pickup_hours','closing_remarks']::text[], array['sender_name','ready_notice','counter_instruction','pickup_hours']::text[], 1),
  ('ready_pickup_closed', 'Ready for Pickup', 'Ready for Pickup — Whitebird Closed', 'Used by Collection when Whitebird is closed. The contact number and closed-door instructions are protected.', 'Good morning, {{sender_name}} here ☀️
{{ready_line}}

{{call_instruction}}
{{missed_call_remarks}}', 'Good morning, {{sender_name}} here ☀️
{{ready_line}}

{{call_instruction}}
{{missed_call_remarks}}', array['sender_name','ready_line','call_instruction','missed_call_remarks']::text[], array['sender_name','ready_line','call_instruction']::text[], 1),
  ('delivery_ready_scheduled', 'Delivery Ready', 'Delivery Ready — Scheduled Delivery', 'Existing scheduled-delivery branch. The delivery-ready status and scheduled time remain protected.', 'Good morning, {{sender_name}} here.
{{scheduled_delivery_line}}
{{earlier_delivery_invitation}}', 'Good morning, {{sender_name}} here.
{{scheduled_delivery_line}}
{{earlier_delivery_invitation}}', array['sender_name','scheduled_delivery_line','earlier_delivery_invitation']::text[], array['sender_name','scheduled_delivery_line']::text[], 1),
  ('delivery_ready_contact_recipient', 'Delivery Ready', 'Delivery Ready — Contact Recipient', 'Used only when the existing different-recipient and notify rules direct staff to contact the recipient.', 'Good morning, {{sender_name}} here.
{{ready_status}}
{{recipient_contact_instruction}}', 'Good morning, {{sender_name}} here.
{{ready_status}}
{{recipient_contact_instruction}}', array['sender_name','ready_status','recipient_contact_instruction']::text[], array['sender_name','ready_status','recipient_contact_instruction']::text[], 1),
  ('out_for_delivery', 'Out for Delivery', 'Out for Delivery', 'Prepared for the orderer and, under existing rules, separately for the recipient.', 'Rider has picked up the order and is on his way ya!', 'Rider has picked up the order and is on his way ya!', array[]::text[], array[]::text[], 1),
  ('general_thank_you', 'General Thank You', 'General Thank You', 'General customer thank-you offered at the existing fulfillment stages.', 'Thank you for the order and hope you enjoy ya ;)

If there’s anything please do not hesitate to let us know so we can improve and serve you better !

Thank you once again and have a nice day ahead!', 'Thank you for the order and hope you enjoy ya ;)

If there’s anything please do not hesitate to let us know so we can improve and serve you better !

Thank you once again and have a nice day ahead!', array[]::text[], array[]::text[], 1),
  ('waiting_list_confirmation', 'Waiting List Confirmation', 'Waiting List Confirmation', 'Generated after staff issues an eligible confirmation link. The URL, token-derived link, deadline and required instructions remain application-controlled.', 'Hi {{customer_name}} 👋

Good news — we can proceed with your Whitebird Waiting List request for {{pickup_date}}.

Your request:
{{item_lines}}

{{confirmation_link_instruction}}

{{confirmation_url}}

Please complete your confirmation by {{deadline}}.

{{expiry_instruction}}

Thank you! 🤍', 'Hi {{customer_name}} 👋

Good news — we can proceed with your Whitebird Waiting List request for {{pickup_date}}.

Your request:
{{item_lines}}

{{confirmation_link_instruction}}

{{confirmation_url}}

Please complete your confirmation by {{deadline}}.

{{expiry_instruction}}

Thank you! 🤍', array['customer_name','pickup_date','item_lines','confirmation_link_instruction','confirmation_url','deadline','expiry_instruction']::text[], array['customer_name','pickup_date','item_lines','confirmation_link_instruction','confirmation_url','deadline','expiry_instruction']::text[], 1);

insert into public.customer_message_template_revisions
  (template_key, revision, action, previous_body, new_body, actor_staff_id, actor_display_name)
select template_key, 1, 'seed', body, body, null, 'Whitebird defaults'
from public.customer_message_templates;

create function public._write_customer_message_template(
  p_template_key text,
  p_body text,
  p_expected_revision integer,
  p_action text,
  p_restored_revision integer default null
)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  template_row public.customer_message_templates%rowtype;
  actor_id uuid;
  actor_name text;
  found_tokens text[];
  unknown_tokens text[];
  missing_tokens text[];
  next_revision integer;
begin
  if not public.customer_message_templates_can_manage() then
    raise exception 'Owner or Manager permission required' using errcode = '42501';
  end if;

  select sp.id, sp.display_name into actor_id, actor_name
  from public.staff_profiles sp
  where sp.auth_user_id = auth.uid()
    and sp.is_active = true
    and sp.archived_at is null;
  if actor_id is null then
    raise exception 'Active staff profile required' using errcode = '42501';
  end if;

  if p_action not in ('save','reset','restore') then
    raise exception 'Invalid template action' using errcode = '22023';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 12000 then
    raise exception 'Template body must be non-empty and at most 12000 characters' using errcode = '22023';
  end if;
  if p_body ~* '(sb_secret_[a-z0-9_-]{16,}|eyJ[a-z0-9_-]{24,}\.[a-z0-9_-]{12,}|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|RESEND_API_KEY)' then
    raise exception 'Credential-like text is not permitted' using errcode = '22023';
  end if;

  select * into template_row
  from public.customer_message_templates
  where template_key = p_template_key
  for update;
  if not found then
    raise exception 'Unknown message template' using errcode = '22023';
  end if;
  if template_row.revision <> p_expected_revision then
    raise exception 'Template revision conflict' using errcode = '40001';
  end if;
  if p_action = 'reset' and p_body <> template_row.default_body then
    raise exception 'Reset must use the stored default wording' using errcode = '22023';
  end if;
  if p_action = 'restore' and p_restored_revision is null then
    raise exception 'Restore revision is required' using errcode = '22023';
  end if;

  if regexp_replace(p_body, '\{\{[^{}]+\}\}', '', 'g') ~ '[{}]' then
    raise exception 'Malformed placeholder syntax' using errcode = '22023';
  end if;
  select coalesce(array_agg(match_parts[1]), '{}'::text[])
  into found_tokens
  from regexp_matches(p_body, '\{\{([^{}]+)\}\}', 'g') as match_parts;

  select coalesce(array_agg(distinct token), '{}'::text[])
  into unknown_tokens
  from unnest(found_tokens) as token
  where not (token = any(template_row.allowed_placeholders));
  if cardinality(unknown_tokens) > 0 then
    raise exception 'Unknown placeholder: %', array_to_string(unknown_tokens, ', ') using errcode = '22023';
  end if;

  select coalesce(array_agg(required_token), '{}'::text[])
  into missing_tokens
  from unnest(template_row.required_placeholders) as required_token
  where not (required_token = any(found_tokens));
  if cardinality(missing_tokens) > 0 then
    raise exception 'Required placeholder missing: %', array_to_string(missing_tokens, ', ') using errcode = '22023';
  end if;

  next_revision := template_row.revision + 1;
  insert into public.customer_message_template_revisions
    (template_key, revision, action, previous_body, new_body, actor_staff_id, actor_display_name)
  values
    (p_template_key, next_revision, p_action, template_row.body, p_body, actor_id, actor_name);

  update public.customer_message_templates
  set body = p_body, revision = next_revision, updated_at = now(), updated_by = actor_id
  where template_key = p_template_key;
  return next_revision;
end;
$$;

revoke all on function public._write_customer_message_template(text,text,integer,text,integer) from public, anon, authenticated;

create function public.save_customer_message_template(p_template_key text, p_body text, p_expected_revision integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return public._write_customer_message_template(p_template_key, p_body, p_expected_revision, 'save', null);
end;
$$;

create function public.reset_customer_message_template(p_template_key text, p_expected_revision integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare default_text text;
begin
  if not public.customer_message_templates_can_manage() then
    raise exception 'Owner or Manager permission required' using errcode = '42501';
  end if;
  select default_body into default_text
  from public.customer_message_templates
  where template_key = p_template_key;
  if not found then
    raise exception 'Unknown message template' using errcode = '22023';
  end if;
  return public._write_customer_message_template(p_template_key, default_text, p_expected_revision, 'reset', null);
end;
$$;

create function public.restore_customer_message_template_revision(
  p_template_key text, p_revision integer, p_expected_revision integer
)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare restored_text text;
begin
  if not public.customer_message_templates_can_manage() then
    raise exception 'Owner or Manager permission required' using errcode = '42501';
  end if;
  select new_body into restored_text
  from public.customer_message_template_revisions
  where template_key = p_template_key and revision = p_revision;
  if not found then
    raise exception 'Unknown revision' using errcode = '22023';
  end if;
  return public._write_customer_message_template(p_template_key, restored_text, p_expected_revision, 'restore', p_revision);
end;
$$;

revoke all on function public.save_customer_message_template(text,text,integer) from public, anon;
revoke all on function public.reset_customer_message_template(text,integer) from public, anon;
revoke all on function public.restore_customer_message_template_revision(text,integer,integer) from public, anon;
grant execute on function public.save_customer_message_template(text,text,integer) to authenticated;
grant execute on function public.reset_customer_message_template(text,integer) to authenticated;
grant execute on function public.restore_customer_message_template_revision(text,integer,integer) to authenticated;
