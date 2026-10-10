-- Local pause bridge for the legacy Production staff-email worker.
--
-- This intentionally disables only email claim/finalization RPC behavior.
-- It preserves the existing signatures, return shapes, owners, and grants.
-- No delivery/event rows, triggers, preferences, or in-app notification paths
-- are changed. There is no activation or backlog-recovery path in this file.

create or replace function public.claim_staff_notification_email_deliveries(
  p_limit integer default 50,
  p_event_id uuid default null,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  event_id uuid,
  staff_id uuid,
  staff_email text,
  claimed_until timestamptz,
  event_key text,
  code text,
  title text,
  description text,
  href text,
  payload jsonb,
  order_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Do not claim, retry, or mutate any delivery while the bridge is installed.
  return;
end;
$$;

create or replace function public.complete_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_status text,
  p_error text default null,
  p_resend_id text default null,
  p_claimed_until timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Old workers may still finish after the claim fence. Fail closed without
  -- raising into their caller and without modifying historical rows.
  return false;
end;
$$;

create or replace function public.suppress_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_claimed_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A worker holding a pre-pause claim must not rewrite even a stale reminder
  -- delivery row after this fence is installed.
  return false;
end;
$$;
