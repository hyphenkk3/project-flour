-- Customer-facing FAQ content. Informational only — not operational rules.

create table public.storefront_faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  display_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_faq_items_question_not_blank
    check (char_length(trim(question)) > 0),
  constraint storefront_faq_items_answer_not_blank
    check (char_length(trim(answer)) > 0),
  constraint storefront_faq_items_display_order_positive
    check (display_order >= 1)
);

comment on table public.storefront_faq_items is
  'Customer-facing FAQ copy. Informational only. Does not control '
  'preorder, delivery, dine-in, operating hours, or Fresh Picks rules.';

create unique index storefront_faq_items_question_ci_idx
  on public.storefront_faq_items (lower(btrim(question)));

create index storefront_faq_items_display_order_idx
  on public.storefront_faq_items (display_order, id);

create trigger storefront_faq_items_set_updated_at
before update on public.storefront_faq_items
for each row
execute function public.set_updated_at();

alter table public.storefront_faq_items enable row level security;

create policy storefront_faq_items_select_public_active
on public.storefront_faq_items
for select
to anon
using (is_active = true);

create policy storefront_faq_items_select_authenticated
on public.storefront_faq_items
for select
to authenticated
using (true);

create policy storefront_faq_items_insert_managers
on public.storefront_faq_items
for insert
to authenticated
with check (public._current_staff_role_code() in ('owner', 'manager'));

create policy storefront_faq_items_update_managers
on public.storefront_faq_items
for update
to authenticated
using (public._current_staff_role_code() in ('owner', 'manager'))
with check (public._current_staff_role_code() in ('owner', 'manager'));

-- No delete policy: deactivate instead of permanent deletion.

grant select on table public.storefront_faq_items
  to anon, authenticated;
grant insert, update on table public.storefront_faq_items
  to authenticated;

insert into public.storefront_faq_items (
  question,
  answer,
  display_order,
  is_active
)
select incoming.question, incoming.answer, incoming.display_order, true
from (
  values
    (
      1,
      $faq$How many days in advance should I order?$faq$,
      $faq$Cakes are made to order. Each cake shows its preorder requirement — often 2–3 days, and sometimes different by size. Your collection date needs to meet that lead time.$faq$
    ),
    (
      2,
      $faq$How does collection work?$faq$,
      $faq$When you place a preorder, you choose how to receive it — Pickup, Dine-in, or Delivery — for dates when that option is available. You then choose a collection date and time.$faq$
    ),
    (
      3,
      $faq$What happens if I need to change my collection date?$faq$,
      $faq$Before you submit, you can choose a different collection date in checkout. The date still needs to meet each cake’s preorder lead time, and some dates may be unavailable.$faq$
    ),
    (
      4,
      $faq$Can I change my order?$faq$,
      $faq$You can review your cakes, sizes, quantities, and collection date in Your Order before you submit.

After submission, you can contact us via WhatsApp to check whether changes can still be made. Changes are not allowed within the minimum preorder period of 2–3 days, depending on the cake.$faq$
    ),
    (
      5,
      $faq$How is payment handled?$faq$,
      $faq$After you submit, your order is received with payment pending. Whitebird will contact you via WhatsApp about payment.$faq$
    ),
    (
      6,
      $faq$Is there an additional fee for delivery?$faq$,
      $faq$Yes. A RM5 processing fee applies to all delivery orders. The delivery fee itself is separate and will be calculated based on your delivery location. We will confirm the applicable delivery fee before the order is finalized.$faq$
    ),
    (
      7,
      $faq$What is available for dine-in?$faq$,
      $faq$You can enjoy Whitebird cakes and desserts when dining in, together with food and beverages available from Hyphen.$faq$
    ),
    (
      8,
      $faq$What is available for dine-in at night?$faq$,
      $faq$Whitebird is open until 10:00 PM on Fridays, Saturdays and Sundays. After 5:00 PM, only a light menu is available, including waffles, cakes and beverages. There is no regular dinner or meal menu during these hours.$faq$
    ),
    (
      9,
      $faq$What should I know about dine-in reservations?$faq$,
      $faq$- Only light food is available after 5:00 PM on weekends.
- Specific table requests may not be fulfilled.
- Your table will be automatically cancelled if you do not arrive within 10 minutes of your reservation time.$faq$
    ),
    (
      10,
      $faq$What is the relationship between Hyphen and Whitebird?$faq$,
      $faq$Hyphen and Whitebird are partner brands operating together at the same location, with a shared menu. Hyphen focuses on food and beverages, while Whitebird focuses on cakes and desserts.$faq$
    ),
    (
      11,
      $faq$What are your operating and kitchen hours?$faq$,
      $faq$📅 Operating Hours

☕ Hyphen
🕐 9:00 AM – 5:30 PM
📌 Closed on Wednesdays

🕊️ Whitebird
🕐 10:00 AM – 5:30 PM — Monday, Tuesday & Thursday
🕐 10:00 AM – 10:00 PM — Friday, Saturday & Sunday
📌 Closed on Wednesdays

⸻

🍳 Kitchen Hours
• 9:30 AM – 4:30 PM — Weekdays
• 9:30 AM – 5:00 PM — Weekends
• Light menu available after 5:00 PM on weekends
• Cakes available from 10:30 AM onwards

📌 If Wednesday falls on a public holiday, both outlets will be open as usual.

📌 Operating hours and off days may change for public holidays or special occasions. Please check our Instagram for the latest updates before visiting.$faq$
    ),
    (
      12,
      $faq$Do you offer Fresh Picks?$faq$,
      $faq$Yes. Fresh Picks are special cakes released by Bakery for today or tomorrow, in limited quantities. When none are available, Fresh Picks will show as unavailable.$faq$
    ),
    (
      13,
      $faq$How will I be contacted after submitting an order?$faq$,
      $faq$Whitebird will contact you via WhatsApp. Please use a number you can be reached on; it is required when you submit.$faq$
    )
) as incoming(display_order, question, answer)
where not exists (
  select 1
  from public.storefront_faq_items existing
  where lower(btrim(existing.question)) = lower(btrim(incoming.question))
);
