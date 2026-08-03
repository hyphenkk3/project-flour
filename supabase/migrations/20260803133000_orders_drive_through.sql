-- Sprint 1.1 validation: add drive-through fulfilment method.

alter type public.fulfilment_method add value if not exists 'drive_through';
