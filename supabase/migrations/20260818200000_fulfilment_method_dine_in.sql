-- Whole Cake customer Dine-in fulfilment method.
-- Additive enum value only. Existing Pickup / Delivery rows unchanged.
-- Must commit before 20260818210000 which uses 'dine_in'.

alter type public.fulfilment_method add value if not exists 'dine_in';
