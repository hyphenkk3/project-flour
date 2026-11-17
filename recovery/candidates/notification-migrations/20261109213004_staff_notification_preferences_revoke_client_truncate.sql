-- Remove the unnecessary table-wide destructive capability from client roles.
-- RLS policies and all other table privileges remain unchanged.
REVOKE TRUNCATE ON TABLE public.staff_notification_preferences FROM anon, authenticated;
