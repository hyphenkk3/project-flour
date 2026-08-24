-- Rework staff notification categories.
--
-- Guest preorder is not a separate notification category.
-- A guest preorder is a new order and follows the new_order preference.
--
-- Last-minute activity is intentionally isolated into last_minute so
-- urgent operational movements can be monitored independently.

-- Remove the obsolete standalone category BEFORE applying the new constraint.
delete from public.staff_notification_preferences
where notification_code = 'guest_preorder';

-- Replace the old notification-code constraint.
alter table public.staff_notification_preferences
  drop constraint if exists staff_notification_preferences_code_check;

alter table public.staff_notification_preferences
  add constraint staff_notification_preferences_code_check
  check (
    notification_code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute'
    )
  );

-- Existing last-minute preferences, if any were created previously,
-- remain valid under the new category.
