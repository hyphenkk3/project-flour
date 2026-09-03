-- Staff notification status-transition support.
--
-- order_paid and order_cancelled compare OLD vs NEW status in Supabase
-- Realtime UPDATE payloads, so the orders table must expose the previous
-- row values to the realtime listener.

alter table public.orders replica identity full;
