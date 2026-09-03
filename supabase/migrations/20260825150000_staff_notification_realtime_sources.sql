-- Staff notification realtime sources.
--
-- The notification preference UI already defines seven categories.
-- This migration exposes the event tables needed by the browser-side
-- notification listener. Email delivery will later move to server-side
-- processing and will no longer depend on this browser listener.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_timeline_events'
  ) then
    alter publication supabase_realtime
      add table public.order_timeline_events;
  end if;
exception
  when undefined_object then
    null;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operations_approval_requests'
  ) then
    alter publication supabase_realtime
      add table public.operations_approval_requests;
  end if;
exception
  when undefined_object then
    null;
end
$$;
