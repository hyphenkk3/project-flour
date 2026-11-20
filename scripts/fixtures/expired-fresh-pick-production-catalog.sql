-- Sanitized schema-only reconstruction from read-only Production catalogs.

-- Captured from Supabase cuowwlduhxxifmpvpltt, PostgreSQL 17.6, 2026-10-31.

-- Sanitized schema-only capture: actual Production function and trigger definitions are recreated and fingerprint-checked; no customer, payment, stock, or staff rows are copied.

CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
END $$;

CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
REVOKE ALL ON FUNCTION auth.role() FROM PUBLIC, dashboard_user;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC, dashboard_user;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC, dashboard_user;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, dashboard_user;

CREATE TABLE public.customers(id uuid PRIMARY KEY); CREATE TABLE public.collections(id uuid PRIMARY KEY);
-- Exact schema-only tables required by the captured Production trigger/function call graph.
-- Supabase Vault is provider-managed. The Production view's exposed nine-column interface is recreated with zero rows; no secret rows or key material are copied.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE VIEW vault.decrypted_secrets AS
SELECT NULL::uuid AS id, NULL::text AS name, NULL::text AS description,
       NULL::text AS secret, NULL::text AS decrypted_secret, NULL::uuid AS key_id,
       NULL::bytea AS nonce, NULL::timestamptz AS created_at,
       NULL::timestamptz AS updated_at
WHERE false;
CREATE TABLE IF NOT EXISTS library_vouchers (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS library_cake_categories (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS paid_addon_types (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE TYPE public.dine_in_venue AS ENUM ('hyphen', 'whitebird');
CREATE TYPE public.library_cake_status AS ENUM ('draft', 'ready_for_release', 'active', 'seasonal', 'retired');
CREATE TYPE public.recipient_notify_preference AS ENUM ('inform_recipient', 'do_not_inform_recipient');
CREATE TABLE public.catalogue_voucher_redemptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  voucher_id uuid NOT NULL,
  order_id uuid NOT NULL,
  adjustment_id uuid NOT NULL,
  discount_amount numeric(10,2) NOT NULL,
  status text NOT NULL,
  redeemed_at timestamp with time zone DEFAULT now() NOT NULL,
  released_at timestamp with time zone,
  release_reason text,
  released_by uuid,
  actor_staff_id uuid,
  source text DEFAULT 'apply_catalogue_voucher'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fresh_pick_readiness_undo_holds (
  order_id uuid NOT NULL,
  undone_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  undone_by uuid NOT NULL
);

CREATE TABLE public.library_cake_sizes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cake_id uuid NOT NULL,
  label text NOT NULL,
  serves text,
  price numeric(10,2) DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  preorder_days integer DEFAULT 2 NOT NULL,
  available_from date,
  available_until date
);

CREATE TABLE public.library_cakes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  sharing_guide text,
  allergens text[] DEFAULT '{}'::text[] NOT NULL,
  bakery_notes text,
  status library_cake_status DEFAULT 'draft'::library_cake_status NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category_id uuid,
  show_in_popular_cakes boolean DEFAULT false NOT NULL,
  popular_cakes_sort_order integer
);

CREATE TABLE public.order_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  kind text DEFAULT 'manual'::text NOT NULL,
  label text NOT NULL,
  amount numeric(10,2) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  code text,
  reason text,
  reference_type text,
  reference_id uuid,
  status text DEFAULT 'active'::text NOT NULL,
  reverses_adjustment_id uuid
);

CREATE TABLE public.order_delivery_details (
  order_id uuid NOT NULL,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text,
  postcode text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  recipient_notify_preference recipient_notify_preference NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  delivery_finance_enabled boolean DEFAULT false NOT NULL,
  processing_fee_applicable_amount numeric(10,2),
  processing_fee_override_amount numeric(10,2),
  processing_fee_waived boolean DEFAULT false NOT NULL,
  delivery_fee_status text DEFAULT 'not_set'::text NOT NULL,
  delivery_fee_quoted_amount numeric(10,2),
  delivery_fee_waived boolean DEFAULT false NOT NULL,
  fee_request_kind text,
  fee_request_status text,
  fee_request_proposed_amount numeric(10,2),
  fee_request_reason text,
  fee_requested_by uuid,
  fee_requested_at timestamp with time zone,
  fee_resolved_by uuid,
  fee_resolved_at timestamp with time zone,
  fee_resolution_note text,
  delivery_fee_request_status text,
  delivery_fee_request_reason text,
  delivery_fee_request_quoted_amount numeric(10,2),
  delivery_fee_requested_by uuid,
  delivery_fee_requested_at timestamp with time zone,
  delivery_fee_request_resolved_by uuid,
  delivery_fee_request_resolved_at timestamp with time zone,
  delivery_fee_request_resolution_note text,
  processing_fee_request_kind text,
  processing_fee_request_status text,
  processing_fee_request_proposed_amount numeric(10,2),
  processing_fee_request_reason text,
  processing_fee_requested_by uuid,
  processing_fee_requested_at timestamp with time zone,
  processing_fee_request_resolved_by uuid,
  processing_fee_request_resolved_at timestamp with time zone,
  processing_fee_request_resolution_note text
);

CREATE TABLE public.order_dine_in_reservations (
  order_id uuid NOT NULL,
  reservation_date date NOT NULL,
  reservation_time time without time zone NOT NULL,
  guest_count integer NOT NULL,
  reservation_note text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  venue dine_in_venue NOT NULL,
  adult_count integer DEFAULT 0 NOT NULL,
  kid_count integer DEFAULT 0 NOT NULL,
  toddler_count integer DEFAULT 0 NOT NULL,
  whitebird_split_seating_acknowledged boolean DEFAULT false NOT NULL
);

CREATE TABLE public.order_paid_addons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  paid_addon_type_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  financial_shorthand text NOT NULL,
  quantity integer NOT NULL,
  written_message text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id uuid NOT NULL,
  order_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_corrections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id uuid NOT NULL,
  payment_allocation_id uuid NOT NULL,
  order_id uuid NOT NULL,
  correction_type text NOT NULL,
  original_amount numeric(10,2) NOT NULL,
  corrected_amount numeric(10,2) NOT NULL,
  original_method text NOT NULL,
  corrected_method text NOT NULL,
  original_method_description text,
  corrected_method_description text,
  reason text NOT NULL,
  corrected_by uuid NOT NULL,
  corrected_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  amount numeric(10,2) NOT NULL,
  method text NOT NULL,
  method_description text,
  paid_at timestamp with time zone NOT NULL,
  reference_note text,
  verified_by uuid NOT NULL,
  verified_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'verified'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  payment_id uuid,
  amount numeric(10,2) NOT NULL,
  reason text,
  refunded_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  status text DEFAULT 'recorded'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  refund_type text DEFAULT 'overpayment_correction'::text NOT NULL,
  refund_method text,
  refund_method_description text,
  request_key uuid
);

CREATE TABLE public.staff_notification_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_key text NOT NULL,
  code text NOT NULL,
  order_id uuid,
  approval_id uuid,
  title text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  href text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TYPE public.extra_stock_lifecycle AS ENUM ('proposed', 'confirmed', 'rejected');
CREATE TYPE public.fulfilment_method AS ENUM ('pickup', 'delivery', 'drive_through', 'dine_in');
CREATE TYPE public.order_status AS ENUM ('submitted', 'pending_confirmation', 'confirmed', 'awaiting_payment', 'paid', 'cancelled', 'completed');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded');

CREATE TABLE public.extra_stock (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lifecycle extra_stock_lifecycle NOT NULL,
  cake_name text NOT NULL,
  size_label text NOT NULL,
  library_cake_id uuid,
  library_cake_size_id uuid,
  prepared_on date,
  pickup_through_at timestamp with time zone,
  note text,
  proposed_at timestamp with time zone DEFAULT now() NOT NULL,
  proposed_by uuid NOT NULL,
  confirmed_at timestamp with time zone,
  confirmed_by uuid,
  rejected_at timestamp with time zone,
  rejected_by uuid,
  reject_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pickup_available_from_at timestamp with time zone,
  sold_at timestamp with time zone,
  cut_into_slices_at timestamp with time zone,
  cut_into_slices_by uuid,
  order_id uuid,
  walk_in_held_at timestamp with time zone,
  walk_in_held_until timestamp with time zone,
  walk_in_held_by uuid,
  walk_in_hold_extended_at timestamp with time zone,
  walk_in_hold_reminder_sent_at timestamp with time zone,
  ready_for_collection boolean DEFAULT false NOT NULL
);

CREATE TABLE public.extra_stock_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  extra_stock_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_staff_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  cake_id uuid NOT NULL,
  cake_size_id uuid NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  cake_name text NOT NULL,
  size_label text NOT NULL
);

CREATE TABLE public.order_timeline_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_staff_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_number text NOT NULL,
  customer_id uuid,
  fulfilment_method fulfilment_method NOT NULL,
  pickup_date date NOT NULL,
  pickup_time time without time zone NOT NULL,
  status order_status DEFAULT 'submitted'::order_status NOT NULL,
  payment_status payment_status DEFAULT 'unpaid'::payment_status NOT NULL,
  internal_notes text,
  customer_notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  guest_name text,
  guest_phone text,
  guest_email text,
  confirmation_needs_resend boolean DEFAULT false NOT NULL,
  collection_id uuid,
  payment_deadline_at timestamp with time zone,
  payment_request_sent_at timestamp with time zone,
  order_source text DEFAULT 'customer_website'::text NOT NULL,
  rm10_card_issuance_suppressed boolean DEFAULT false NOT NULL,
  rm10_card_issuance_suppression_code text,
  email_submission_receipt_requested boolean DEFAULT false NOT NULL,
  crew_order boolean DEFAULT false NOT NULL,
  include_receipt boolean DEFAULT false NOT NULL,
  needs_bakery_attention boolean DEFAULT false NOT NULL,
  bakery_attention_note text,
  ready_at timestamp with time zone,
  ready_by uuid,
  picked_up_at timestamp with time zone,
  picked_up_by uuid,
  pickup_instruction text,
  out_for_delivery_at timestamp with time zone,
  out_for_delivery_by uuid,
  delivered_at timestamp with time zone,
  delivered_by uuid,
  production_started_at timestamp with time zone,
  production_started_by uuid,
  extra_stock_id uuid,
  post_payment_customer_change_count integer DEFAULT 0 NOT NULL,
  post_payment_customer_change_used_at timestamp with time zone,
  post_payment_change_override_at timestamp with time zone,
  post_payment_change_override_by uuid,
  order_source_other text
);

CREATE TABLE public.roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.staff_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_user_id uuid NOT NULL,
  username citext NOT NULL,
  email text,
  display_name text NOT NULL,
  role_id uuid NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_master_owner boolean DEFAULT false NOT NULL,
  must_change_password boolean DEFAULT false NOT NULL,
  archived_at timestamp with time zone
);

-- Exact Production dispatch configuration table shape; no dispatch URL or customer data is copied.
CREATE TABLE public.staff_notification_dispatch_config (
  id boolean DEFAULT true NOT NULL,
  dispatch_url text,
  per_event_enabled boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.staff_notification_dispatch_config ADD CONSTRAINT staff_notification_dispatch_config_pkey PRIMARY KEY (id);
ALTER TABLE public.staff_notification_dispatch_config ADD CONSTRAINT staff_notification_dispatch_config_id_check CHECK (id);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_adjustment_unique UNIQUE (adjustment_id);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_order_voucher_unique UNIQUE (order_id, voucher_id);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_pkey PRIMARY KEY (id);
ALTER TABLE public.fresh_pick_readiness_undo_holds ADD CONSTRAINT fresh_pick_readiness_undo_holds_pkey PRIMARY KEY (order_id);
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_pkey PRIMARY KEY (id);
ALTER TABLE public.library_cakes ADD CONSTRAINT library_cakes_pkey PRIMARY KEY (id);
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_pkey PRIMARY KEY (order_id);
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_pkey PRIMARY KEY (order_id);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_order_code_unique UNIQUE (order_id, code);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_one_per_allocation UNIQUE (payment_allocation_id);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_one_per_payment UNIQUE (payment_id);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.staff_notification_events ADD CONSTRAINT staff_notification_events_event_key_unique UNIQUE (event_key);
ALTER TABLE public.staff_notification_events ADD CONSTRAINT staff_notification_events_pkey PRIMARY KEY (id);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_pkey PRIMARY KEY (id);
ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_pkey PRIMARY KEY (id);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.roles ADD CONSTRAINT roles_code_key UNIQUE (code);
ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_auth_user_id_key UNIQUE (auth_user_id);
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_username_key UNIQUE (username);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES order_adjustments(id) ON DELETE RESTRICT;
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_discount_positive CHECK (discount_amount > 0::numeric);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_release_shape CHECK (status = 'redeemed'::text AND released_at IS NULL AND release_reason IS NULL OR status = 'released'::text AND released_at IS NOT NULL AND NULLIF(TRIM(BOTH FROM COALESCE(release_reason, ''::text)), ''::text) IS NOT NULL);
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_released_by_fkey FOREIGN KEY (released_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_status_check CHECK (status = ANY (ARRAY['redeemed'::text, 'released'::text]));
ALTER TABLE public.catalogue_voucher_redemptions ADD CONSTRAINT catalogue_voucher_redemptions_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES library_vouchers(id) ON DELETE RESTRICT;
ALTER TABLE public.fresh_pick_readiness_undo_holds ADD CONSTRAINT fresh_pick_readiness_undo_holds_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.fresh_pick_readiness_undo_holds ADD CONSTRAINT fresh_pick_readiness_undo_holds_undone_by_fkey FOREIGN KEY (undone_by) REFERENCES staff_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_availability_range_check CHECK (available_from IS NULL OR available_until IS NULL OR available_until >= available_from);
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_cake_id_fkey FOREIGN KEY (cake_id) REFERENCES library_cakes(id) ON DELETE CASCADE;
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_label_not_blank CHECK (char_length(TRIM(BOTH FROM label)) > 0);
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_preorder_days_positive CHECK (preorder_days >= 1);
ALTER TABLE public.library_cake_sizes ADD CONSTRAINT library_cake_sizes_price_non_negative CHECK (price >= 0::numeric);
ALTER TABLE public.library_cakes ADD CONSTRAINT library_cakes_category_id_fkey FOREIGN KEY (category_id) REFERENCES library_cake_categories(id) ON DELETE RESTRICT;
ALTER TABLE public.library_cakes ADD CONSTRAINT library_cakes_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.library_cakes ADD CONSTRAINT library_cakes_name_not_blank CHECK (char_length(TRIM(BOTH FROM name)) > 0);
ALTER TABLE public.library_cakes ADD CONSTRAINT library_cakes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_amount_nonzero CHECK (amount <> 0::numeric);
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_kind_not_blank CHECK (char_length(TRIM(BOTH FROM kind)) > 0);
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_label_not_blank CHECK (char_length(TRIM(BOTH FROM label)) > 0);
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_reversal_status_check CHECK (reverses_adjustment_id IS NULL OR status = 'active'::text);
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_reverses_adjustment_id_fkey FOREIGN KEY (reverses_adjustment_id) REFERENCES order_adjustments(id) ON DELETE RESTRICT;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_status_check CHECK (status = ANY (ARRAY['active'::text, 'reversed'::text]));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_address_line_1_not_blank CHECK (char_length(TRIM(BOTH FROM address_line_1)) > 0);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_city_not_blank CHECK (char_length(TRIM(BOTH FROM city)) > 0);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_delivery_fee_request_resolved_by_fkey FOREIGN KEY (delivery_fee_request_resolved_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_delivery_fee_request_status_check CHECK (delivery_fee_request_status IS NULL OR (delivery_fee_request_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_delivery_fee_requested_by_fkey FOREIGN KEY (delivery_fee_requested_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_delivery_fee_status_check CHECK (delivery_fee_status = ANY (ARRAY['not_set'::text, 'quoted'::text, 'quoted_waived'::text]));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_delivery_quote_check CHECK (delivery_fee_status = 'not_set'::text AND delivery_fee_quoted_amount IS NULL AND delivery_fee_waived = false OR delivery_fee_status = 'quoted'::text AND delivery_fee_quoted_amount IS NOT NULL AND delivery_fee_quoted_amount > 0::numeric AND delivery_fee_waived = false OR delivery_fee_status = 'quoted_waived'::text AND delivery_fee_quoted_amount IS NOT NULL AND delivery_fee_quoted_amount > 0::numeric AND delivery_fee_waived = true);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_fee_request_kind_check CHECK (fee_request_kind IS NULL OR (fee_request_kind = ANY (ARRAY['processing_override'::text, 'processing_waiver'::text, 'delivery_waiver'::text])));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_fee_request_status_check CHECK (fee_request_status IS NULL OR (fee_request_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_fee_requested_by_fkey FOREIGN KEY (fee_requested_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_fee_resolved_by_fkey FOREIGN KEY (fee_resolved_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_postcode_not_blank CHECK (char_length(TRIM(BOTH FROM postcode)) > 0);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_processing_amounts_nonneg_check CHECK ((processing_fee_applicable_amount IS NULL OR processing_fee_applicable_amount >= 0::numeric) AND (processing_fee_override_amount IS NULL OR processing_fee_override_amount >= 0::numeric));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_processing_fee_request_kind_check CHECK (processing_fee_request_kind IS NULL OR (processing_fee_request_kind = ANY (ARRAY['processing_override'::text, 'processing_waiver'::text])));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_processing_fee_request_resolved_by_fkey FOREIGN KEY (processing_fee_request_resolved_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_processing_fee_request_status_check CHECK (processing_fee_request_status IS NULL OR (processing_fee_request_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_processing_fee_requested_by_fkey FOREIGN KEY (processing_fee_requested_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_recipient_name_not_blank CHECK (char_length(TRIM(BOTH FROM recipient_name)) > 0);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_recipient_phone_not_blank CHECK (char_length(TRIM(BOTH FROM recipient_phone)) > 0);
ALTER TABLE public.order_delivery_details ADD CONSTRAINT order_delivery_details_state_not_blank CHECK (char_length(TRIM(BOTH FROM state)) > 0);
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_guest_count_positive CHECK (guest_count >= 1 AND guest_count <= 50);
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_party_nonneg CHECK (adult_count >= 0 AND kid_count >= 0 AND toddler_count >= 0);
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_party_total CHECK (guest_count = (adult_count + kid_count + toddler_count));
ALTER TABLE public.order_dine_in_reservations ADD CONSTRAINT order_dine_in_reservations_status_known CHECK (status = ANY (ARRAY['pending'::text, 'seated'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_code_not_blank CHECK (char_length(TRIM(BOTH FROM code)) > 0);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_name_not_blank CHECK (char_length(TRIM(BOTH FROM name)) > 0);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_paid_addon_type_id_fkey FOREIGN KEY (paid_addon_type_id) REFERENCES paid_addon_types(id) ON DELETE SET NULL;
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_shorthand_not_blank CHECK (char_length(TRIM(BOTH FROM financial_shorthand)) > 0);
ALTER TABLE public.order_paid_addons ADD CONSTRAINT order_paid_addons_unit_price_non_negative CHECK (unit_price >= 0::numeric);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0::numeric);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_changes_value CHECK (original_amount IS DISTINCT FROM corrected_amount OR original_method IS DISTINCT FROM corrected_method OR COALESCE(original_method_description, ''::text) IS DISTINCT FROM COALESCE(corrected_method_description, ''::text));
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_corrected_amount_check CHECK (corrected_amount >= 0::numeric);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_corrected_by_fkey FOREIGN KEY (corrected_by) REFERENCES staff_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_corrected_method_check CHECK (corrected_method = ANY (ARRAY['wb_qr'::text, 'online_transfer'::text, 'others'::text]));
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_corrected_others_description CHECK (corrected_method = 'others'::text AND NULLIF(TRIM(BOTH FROM corrected_method_description), ''::text) IS NOT NULL OR corrected_method <> 'others'::text AND corrected_method_description IS NULL);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_correction_type_check CHECK (correction_type = ANY (ARRAY['amount'::text, 'method'::text, 'combined'::text]));
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_original_amount_check CHECK (original_amount > 0::numeric);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_original_method_check CHECK (original_method = ANY (ARRAY['wb_qr'::text, 'online_transfer'::text, 'others'::text]));
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_original_others_description CHECK (original_method <> 'others'::text OR NULLIF(TRIM(BOTH FROM original_method_description), ''::text) IS NOT NULL);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_payment_allocation_id_fkey FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocations(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_reason_check CHECK (char_length(TRIM(BOTH FROM reason)) > 0);
ALTER TABLE public.payment_corrections ADD CONSTRAINT payment_corrections_type_matches_values CHECK (correction_type = 'amount'::text AND original_amount IS DISTINCT FROM corrected_amount AND NOT original_method IS DISTINCT FROM corrected_method AND COALESCE(original_method_description, ''::text) = COALESCE(corrected_method_description, ''::text) OR correction_type = 'method'::text AND NOT original_amount IS DISTINCT FROM corrected_amount AND (original_method IS DISTINCT FROM corrected_method OR COALESCE(original_method_description, ''::text) IS DISTINCT FROM COALESCE(corrected_method_description, ''::text)) OR correction_type = 'combined'::text AND original_amount IS DISTINCT FROM corrected_amount AND (original_method IS DISTINCT FROM corrected_method OR COALESCE(original_method_description, ''::text) IS DISTINCT FROM COALESCE(corrected_method_description, ''::text)));
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0::numeric);
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (method = ANY (ARRAY['wb_qr'::text, 'online_transfer'::text, 'others'::text]));
ALTER TABLE public.payments ADD CONSTRAINT payments_others_description_required CHECK (method <> 'others'::text OR method_description IS NOT NULL AND char_length(TRIM(BOTH FROM method_description)) > 0);
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status = 'verified'::text);
ALTER TABLE public.payments ADD CONSTRAINT payments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES staff_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0::numeric);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_method_check CHECK (refund_method IS NULL OR (refund_method = ANY (ARRAY['online_transfer'::text, 'wb_qr'::text, 'cash'::text, 'others'::text])));
ALTER TABLE public.refunds ADD CONSTRAINT refunds_method_description_check CHECK (COALESCE(refund_method IS NULL AND refund_method_description IS NULL OR refund_method = 'others'::text AND COALESCE(NULLIF(TRIM(BOTH FROM refund_method_description), ''::text) IS NOT NULL, false) OR (refund_method = ANY (ARRAY['online_transfer'::text, 'wb_qr'::text, 'cash'::text])) AND refund_method_description IS NULL, false));
ALTER TABLE public.refunds ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_reason_length_check CHECK (reason IS NULL OR char_length(reason) <= 2000);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_refund_type_check CHECK (refund_type = ANY (ARRAY['overpayment_correction'::text, 'fresh_pick_cancellation'::text, 'order_refund'::text]));
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (status = 'recorded'::text);
ALTER TABLE public.staff_notification_events ADD CONSTRAINT staff_notification_events_code_check CHECK (code = ANY (ARRAY['new_order'::text, 'order_paid'::text, 'order_confirmed'::text, 'order_cancelled'::text, 'order_edited'::text, 'approval_required'::text, 'last_minute'::text, 'fresh_pick_walk_in_hold_reminder'::text, 'waiting_list_new_request'::text]));
ALTER TABLE public.staff_notification_events ADD CONSTRAINT staff_notification_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_cake_name_nonempty CHECK (length(TRIM(BOTH FROM cake_name)) > 0);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES staff_profiles(id);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_confirmed_requires_fields CHECK (lifecycle <> 'confirmed'::extra_stock_lifecycle OR prepared_on IS NOT NULL AND pickup_through_at IS NOT NULL AND pickup_available_from_at IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_cut_into_slices_by_fkey FOREIGN KEY (cut_into_slices_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_library_cake_id_fkey FOREIGN KEY (library_cake_id) REFERENCES library_cakes(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_library_cake_size_id_fkey FOREIGN KEY (library_cake_size_id) REFERENCES library_cake_sizes(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_pickup_from_order_cutoff_fields CHECK (pickup_available_from_at IS NULL OR pickup_through_at IS NOT NULL);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES staff_profiles(id);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES staff_profiles(id);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_rejected_requires_fields CHECK (lifecycle <> 'rejected'::extra_stock_lifecycle OR rejected_at IS NOT NULL AND rejected_by IS NOT NULL);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_size_label_nonempty CHECK (length(TRIM(BOTH FROM size_label)) > 0);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_sliced_requires_confirmed CHECK (cut_into_slices_at IS NULL OR lifecycle = 'confirmed'::extra_stock_lifecycle AND cut_into_slices_by IS NOT NULL);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_sold_or_sliced_mutex CHECK (sold_at IS NULL OR cut_into_slices_at IS NULL);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_sold_requires_confirmed CHECK (sold_at IS NULL OR lifecycle = 'confirmed'::extra_stock_lifecycle);
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_terminal_mutex CHECK (NOT (confirmed_at IS NOT NULL AND rejected_at IS NOT NULL));
ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_walk_in_held_by_fkey FOREIGN KEY (walk_in_held_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_extra_stock_id_fkey FOREIGN KEY (extra_stock_id) REFERENCES extra_stock(id) ON DELETE CASCADE;
ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_type_not_blank CHECK (char_length(TRIM(BOTH FROM event_type)) > 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_cake_id_fkey FOREIGN KEY (cake_id) REFERENCES library_cakes(id) ON DELETE RESTRICT;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_cake_size_id_fkey FOREIGN KEY (cake_size_id) REFERENCES library_cake_sizes(id) ON DELETE RESTRICT;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_unit_price_non_negative CHECK (unit_price >= 0::numeric);
ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_type_not_blank CHECK (char_length(TRIM(BOTH FROM event_type)) > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_extra_stock_id_fkey FOREIGN KEY (extra_stock_id) REFERENCES extra_stock(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD CONSTRAINT orders_guest_or_customer CHECK (customer_id IS NOT NULL OR customer_id IS NULL AND guest_name IS NOT NULL AND char_length(TRIM(BOTH FROM guest_name)) > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_format CHECK (order_number ~ '^ORD-[0-9]{8}-[0-9]{4}$'::text);
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check CHECK (order_source = ANY (ARRAY['customer_website'::text, 'jotform'::text, 'whatsapp'::text, 'whitebird_instagram'::text, 'wee'::text, 'lex'::text, 'kin'::text, 'walk_in'::text, 'last_minute'::text, 'other'::text]));
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_other_nonblank_check CHECK (order_source_other IS NULL OR char_length(btrim(order_source_other)) > 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_out_for_delivery_by_fkey FOREIGN KEY (out_for_delivery_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_picked_up_by_fkey FOREIGN KEY (picked_up_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_post_payment_change_override_by_fkey FOREIGN KEY (post_payment_change_override_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_post_payment_customer_change_count_nonneg CHECK (post_payment_customer_change_count >= 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_production_started_by_fkey FOREIGN KEY (production_started_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_ready_by_fkey FOREIGN KEY (ready_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_rm10_suppression_code_check CHECK (rm10_card_issuance_suppression_code IS NULL OR (rm10_card_issuance_suppression_code = ANY (ARRAY['august_promo_applied'::text, 'rm10_voucher_redeemed'::text])));
ALTER TABLE public.orders ADD CONSTRAINT orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_archived_inactive_chk CHECK (archived_at IS NULL OR is_active = false);
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_username_format CHECK (username ~ '^[a-zA-Z0-9._-]{3,32}$'::citext);
ALTER TABLE public.extra_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extra_stock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extra_stock DISABLE TRIGGER USER;
ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.order_items DISABLE TRIGGER USER;




























































CREATE INDEX extra_stock_lifecycle_idx ON public.extra_stock USING btree (lifecycle);

CREATE INDEX extra_stock_order_id_idx ON public.extra_stock USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE INDEX extra_stock_pickup_through_at_idx ON public.extra_stock USING btree (pickup_through_at);

CREATE INDEX extra_stock_prepared_on_idx ON public.extra_stock USING btree (prepared_on);

CREATE INDEX extra_stock_proposed_at_idx ON public.extra_stock USING btree (proposed_at DESC);

CREATE INDEX extra_stock_walk_in_held_until_idx ON public.extra_stock USING btree (walk_in_held_until) WHERE (walk_in_held_until IS NOT NULL);

CREATE INDEX extra_stock_events_extra_created_idx ON public.extra_stock_events USING btree (extra_stock_id, created_at);

CREATE INDEX order_items_cake_id_idx ON public.order_items USING btree (cake_id);

CREATE INDEX order_items_cake_size_id_idx ON public.order_items USING btree (cake_size_id);

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);

CREATE INDEX order_timeline_events_order_created_idx ON public.order_timeline_events USING btree (order_id, created_at);

CREATE INDEX orders_collection_id_idx ON public.orders USING btree (collection_id);

CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);

CREATE INDEX orders_delivered_at_idx ON public.orders USING btree (delivered_at) WHERE (delivered_at IS NOT NULL);

CREATE UNIQUE INDEX orders_extra_stock_id_unique ON public.orders USING btree (extra_stock_id) WHERE ((extra_stock_id IS NOT NULL) AND (status <> 'cancelled'::order_status));

CREATE INDEX orders_order_number_idx ON public.orders USING btree (order_number);

CREATE INDEX orders_out_for_delivery_at_idx ON public.orders USING btree (out_for_delivery_at) WHERE (out_for_delivery_at IS NOT NULL);

CREATE INDEX orders_payment_deadline_at_idx ON public.orders USING btree (payment_deadline_at) WHERE (payment_deadline_at IS NOT NULL);

CREATE INDEX orders_payment_status_idx ON public.orders USING btree (payment_status);

CREATE INDEX orders_picked_up_at_idx ON public.orders USING btree (picked_up_at) WHERE (picked_up_at IS NOT NULL);

CREATE INDEX orders_pickup_date_idx ON public.orders USING btree (pickup_date);

CREATE INDEX orders_production_started_at_idx ON public.orders USING btree (production_started_at) WHERE (production_started_at IS NOT NULL);

CREATE INDEX orders_ready_at_idx ON public.orders USING btree (ready_at) WHERE (ready_at IS NOT NULL);

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE INDEX orders_updated_at_idx ON public.orders USING btree (updated_at DESC);

CREATE INDEX staff_profiles_archived_at_idx ON public.staff_profiles USING btree (archived_at) WHERE (archived_at IS NOT NULL);

CREATE INDEX staff_profiles_is_active_idx ON public.staff_profiles USING btree (is_active);

CREATE UNIQUE INDEX staff_profiles_one_master_owner_idx ON public.staff_profiles USING btree (is_master_owner) WHERE (is_master_owner = true);

CREATE INDEX staff_profiles_role_id_idx ON public.staff_profiles USING btree (role_id);








CREATE POLICY extra_stock_authenticated_select ON public.extra_stock AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY extra_stock_public_confirmed_select ON public.extra_stock AS PERMISSIVE FOR SELECT TO anon USING (((lifecycle = 'confirmed'::extra_stock_lifecycle) AND (sold_at IS NULL) AND (confirmed_at IS NOT NULL) AND (pickup_through_at IS NOT NULL) AND (now() >= confirmed_at) AND (now() <= pickup_through_at)));

CREATE POLICY extra_stock_events_authenticated_select ON public.extra_stock_events AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY order_items_authenticated_delete ON public.order_items AS PERMISSIVE FOR DELETE TO authenticated USING (true);

CREATE POLICY order_items_authenticated_insert ON public.order_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY order_items_authenticated_select ON public.order_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY order_items_authenticated_update ON public.order_items AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY order_timeline_events_authenticated_insert ON public.order_timeline_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY order_timeline_events_authenticated_select ON public.order_timeline_events AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated staff can insert orders" ON public.orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated staff can select orders" ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated staff can update orders" ON public.orders AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated staff can read roles" ON public.roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can read own profile" ON public.staff_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = auth_user_id));


















































-- Exact relevant Production function definitions captured read-only on 2026-10-31.
-- Includes current assign/slice baselines, trigger functions, and transitive public helpers.
CREATE OR REPLACE FUNCTION public._bind_rpc_actor(p_claimed_staff_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_staff_id uuid;
  v_active boolean;
begin
  v_uid := auth.uid();

  if v_uid is null then
    if auth.role() is distinct from 'service_role' then
      raise exception 'Not authenticated';
    end if;
    if p_claimed_staff_id is null then
      raise exception 'Staff actor is required';
    end if;

    select sp.id, sp.is_active
    into v_staff_id, v_active
    from public.staff_profiles sp
    where sp.id = p_claimed_staff_id
      and sp.archived_at is null;

    if v_staff_id is null then
      raise exception 'Staff actor not found';
    end if;
    if v_active is distinct from true then
      raise exception 'Not authorized';
    end if;
    return v_staff_id;
  end if;

  select sp.id
  into v_staff_id
  from public.staff_profiles sp
  where sp.auth_user_id = v_uid
    and sp.is_active is distinct from false
    and sp.archived_at is null;

  if v_staff_id is null then
    raise exception 'Not authorized';
  end if;

  if p_claimed_staff_id is not null
     and p_claimed_staff_id is distinct from v_staff_id then
    raise exception 'Not authorized';
  end if;

  return v_staff_id;
end;
$function$;
ALTER FUNCTION public._bind_rpc_actor(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._bind_rpc_actor(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._bind_rpc_actor(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public._extra_stock_guard_disposition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sold_at is not null
     and coalesce(old.cut_into_slices_at, new.cut_into_slices_at) is not null then
    raise exception 'This Extra cake has already been sold';
  end if;
  if new.cut_into_slices_at is not null and old.sold_at is not null then
    raise exception 'Cannot cut a sold Extra into slices';
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public._extra_stock_guard_disposition() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._extra_stock_guard_disposition() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._extra_stock_guard_disposition() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._fresh_pick_order_items_are_ready(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_row public.orders;
  stock_count bigint;
begin
  if p_order_id is null then
    return false;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id;

  if not found or order_row.extra_stock_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.extra_stock e
    where e.id = order_row.extra_stock_id
      and e.order_id = p_order_id
  ) then
    return false;
  end if;

  select count(*) into stock_count
  from public.extra_stock e
  where e.order_id = p_order_id;

  if stock_count = 0 then
    return false;
  end if;

  if exists (
    select 1
    from public.extra_stock e
    where e.order_id = p_order_id
      and (
        e.lifecycle is distinct from 'confirmed'
        or e.sold_at is null
        or e.cut_into_slices_at is not null
        or e.ready_for_collection is not true
      )
  ) then
    return false;
  end if;

  -- Every physical unit must have a corresponding order-item quantity, and
  -- every order item must be backed by the exact linked stock cake and size.
  -- This deliberately prevents one ready Fresh Pick from making a mixed or
  -- incomplete order Collection-ready.
  if exists (
    with stock_counts as (
      select
        e.library_cake_id as cake_id,
        e.library_cake_size_id as cake_size_id,
        count(*)::bigint as quantity
      from public.extra_stock e
      where e.order_id = p_order_id
      group by e.library_cake_id, e.library_cake_size_id
    ),
    item_counts as (
      select
        oi.cake_id,
        oi.cake_size_id,
        sum(oi.quantity)::bigint as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.cake_id, oi.cake_size_id
    )
    select 1
    from stock_counts s
    full join item_counts i using (cake_id, cake_size_id)
    where coalesce(s.quantity, 0) <> coalesce(i.quantity, 0)
  ) then
    return false;
  end if;

  return true;
end;
$function$;
ALTER FUNCTION public._fresh_pick_order_items_are_ready(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._fresh_pick_order_items_are_ready(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._guard_fresh_pick_customer_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_token text;
  v_normalized text;
  v_meaningful_parts integer := 0;
BEGIN
  IF NEW.customer_id IS NOT NULL
     OR NEW.order_source IS DISTINCT FROM 'customer_website'
     OR NEW.extra_stock_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_token IN
    SELECT token
    FROM regexp_split_to_table(
      btrim(coalesce(NEW.guest_name, '')),
      '[[:space:]]+'
    ) AS parts(token)
    WHERE token <> ''
  LOOP
    v_normalized := lower(
      regexp_replace(
        regexp_replace(v_token, '^[.,/''’]+|[.,/''’]+$', '', 'g'),
        '\.',
        '',
        'g'
      )
    );

    IF v_normalized = ANY (ARRAY[
      'mr', 'mrs', 'ms', 'miss', 'mdm', 'madam', 'dr', 'prof',
      'professor', 'sir', 'datuk', 'dato', 'datin'
    ]) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Please enter your name without a title.';
    END IF;

    IF v_token ~ '[[:alpha:]]' THEN
      v_meaningful_parts := v_meaningful_parts + 1;
    END IF;
  END LOOP;

  IF v_meaningful_parts < 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Please enter your name and surname with a space between them.';
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION public._guard_fresh_pick_customer_name() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._guard_fresh_pick_customer_name() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._prevent_fresh_pick_assignment_after_production_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_production_started_at timestamptz;
begin
  if new.order_id is null or new.order_id is not distinct from old.order_id then
    return new;
  end if;

  -- Assignments and Start Production both serialize on the order row. If Start
  -- wins, a waiting stock assignment rechecks here and rolls back atomically.
  select o.production_started_at into v_production_started_at
  from public.orders o
  where o.id = new.order_id
  for update;

  if not found then
    raise exception 'Order not found for Fresh Pick assignment';
  end if;
  if v_production_started_at is not null then
    raise exception 'Fresh Pick stock cannot be assigned after production has started';
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public._prevent_fresh_pick_assignment_after_production_start() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._prevent_fresh_pick_assignment_after_production_start() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._record_extra_stock_event(p_extra_stock_id uuid, p_event_type text, p_actor_staff_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.extra_stock_events (
    extra_stock_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_extra_stock_id,
    p_event_type,
    p_actor_staff_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$function$;
ALTER FUNCTION public._record_extra_stock_event(uuid,text,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._record_extra_stock_event(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._record_extra_stock_event(uuid,text,uuid,jsonb) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._staff_notification_cake_display(p_cake_name text, p_size_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when nullif(trim(coalesce(p_cake_name, '')), '') is null then
      nullif(trim(coalesce(p_size_label, '')), '')
    when nullif(trim(coalesce(p_size_label, '')), '') is null then
      trim(p_cake_name)
    when position(
      lower(
        replace(replace(replace(trim(p_size_label), chr(8220), '"'), chr(8221), '"'), chr(8243), '"')
      )
      in
      lower(
        replace(replace(replace(trim(p_cake_name), chr(8220), '"'), chr(8221), '"'), chr(8243), '"')
      )
    ) > 0 then
      trim(p_cake_name)
    else
      trim(p_cake_name) || ' · ' || trim(p_size_label)
  end;
$function$;
ALTER FUNCTION public._staff_notification_cake_display(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._staff_notification_cake_display(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._staff_notification_cake_display(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public._staff_notification_fulfilment_label(p_method fulfilment_method)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_method
    when 'dine_in' then 'Dine-in'
    when 'delivery' then 'Delivery'
    else 'Pickup'
  end;
$function$;
ALTER FUNCTION public._staff_notification_fulfilment_label(fulfilment_method) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._staff_notification_fulfilment_label(fulfilment_method) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._staff_notification_fulfilment_label(fulfilment_method) TO service_role;
CREATE OR REPLACE FUNCTION public._staff_notification_order_cake_name(p_order_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select oi.cake_name
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.created_at
  limit 1;
$function$;
ALTER FUNCTION public._staff_notification_order_cake_name(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._staff_notification_order_cake_name(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._staff_notification_order_cake_name(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public._staff_notification_order_description(p_guest_name text, p_cake_name text, p_pickup_date date, p_order_number text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select concat_ws(
    ' · ',
    nullif(trim(coalesce(p_guest_name, '')), ''),
    nullif(trim(coalesce(p_cake_name, '')), ''),
    p_pickup_date::text,
    nullif(trim(coalesce(p_order_number, '')), '')
  );
$function$;
ALTER FUNCTION public._staff_notification_order_description(text,text,date,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._staff_notification_order_description(text,text,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._staff_notification_order_description(text,text,date,text) TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._staff_role_code(p_staff_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.code
  from public.staff_profiles sp
  join public.roles r on r.id = sp.role_id
  where sp.id = p_staff_id
  limit 1;
$function$;
ALTER FUNCTION public._staff_role_code(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._staff_role_code(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._staff_role_code(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.assert_order_delivery_details_invariant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
  v_method public.fulfilment_method;
  v_count integer;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      return null;
    end if;
    v_order_id := new.id;
  else
    if tg_op = 'DELETE' then
      v_order_id := old.order_id;
    else
      v_order_id := new.order_id;
    end if;
  end if;

  select o.fulfilment_method
  into v_method
  from public.orders o
  where o.id = v_order_id;

  if not found then
    return null;
  end if;

  select count(*)::integer
  into v_count
  from public.order_delivery_details d
  where d.order_id = v_order_id;

  if v_method = 'delivery' then
    if v_count <> 1 then
      raise exception
        'Delivery orders require exactly one order_delivery_details row (found %)',
        v_count;
    end if;
  else
    -- pickup and drive_through (and any future non-delivery methods)
    if v_count <> 0 then
      raise exception
        'Non-delivery orders must not have order_delivery_details rows (found %)',
        v_count;
    end if;
  end if;

  return null;
end;
$function$;
ALTER FUNCTION public.assert_order_delivery_details_invariant() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_order_delivery_details_invariant() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_order_delivery_details_invariant() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.assert_order_dine_in_reservation_invariant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order_id uuid;
  v_method public.fulfilment_method;
  v_count integer;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      return null;
    end if;

    v_order_id := new.id;
    v_method := new.fulfilment_method;
  else
    v_order_id := coalesce(new.order_id, old.order_id);

    select o.fulfilment_method
      into v_method
    from public.orders o
    where o.id = v_order_id;

    if not found then
      return null;
    end if;
  end if;

  select count(*)
    into v_count
  from public.order_dine_in_reservations r
  where r.order_id = v_order_id;

  if v_method = 'dine_in' and v_count <> 1 then
    raise exception
      'Dine-in orders require exactly one reservation (found %)',
      v_count;
  end if;

  if v_method is distinct from 'dine_in' and v_count <> 0 then
    raise exception
      'Dine-in reservation is not allowed when fulfilment is %',
      v_method;
  end if;

  return null;
end;
$function$;
ALTER FUNCTION public.assert_order_dine_in_reservation_invariant() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_order_dine_in_reservation_invariant() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_order_dine_in_reservation_invariant() TO service_role;
CREATE OR REPLACE FUNCTION public.emit_staff_notification_event(p_event_key text, p_code text, p_order_id uuid, p_approval_id uuid, p_title text, p_description text, p_href text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inserted_id uuid;
begin
  insert into public.staff_notification_events (
    event_key,
    code,
    order_id,
    approval_id,
    title,
    description,
    href,
    payload
  )
  values (
    p_event_key,
    p_code,
    p_order_id,
    p_approval_id,
    p_title,
    coalesce(p_description, ''),
    p_href,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into inserted_id;

  return inserted_id;
exception
  when others then
    raise warning 'staff notification emit failed: %', sqlerrm;
    return null;
end;
$function$;
ALTER FUNCTION public.emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.enforce_order_size_availability_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid; o public.orders; i record; s record; v_count integer;
begin
  if tg_table_name='orders' then
    v_id:=new.id;
    if tg_op='UPDATE' and new.pickup_date is not distinct from old.pickup_date
      and new.extra_stock_id is not distinct from old.extra_stock_id then return null; end if;
  else v_id:=new.order_id; end if;
  select * into o from public.orders where id=v_id for share;
  if not found then return null; end if;
  if o.extra_stock_id is not null then
    -- No marker-only exemption: primary stock must actually belong to this
    -- order; each physical unit must match confirmed, uncut linked stock.
    perform 1 from public.extra_stock e where e.id=o.extra_stock_id
      and e.order_id=o.id and e.lifecycle='confirmed' and e.cut_into_slices_at is null for share;
    if not found then raise exception 'Fresh Pick requires legitimate stock linked to this order'; end if;
    for i in select cake_id,cake_size_id,sum(quantity)::integer qty
      from public.order_items where order_id=o.id group by cake_id,cake_size_id loop
      -- Lock before counting so concurrent stock reassignment cannot pass.
      perform 1 from public.extra_stock e where e.order_id=o.id for share;
      select count(*) into v_count from public.extra_stock e where e.order_id=o.id
        and e.library_cake_id=i.cake_id and e.library_cake_size_id=i.cake_size_id
        and e.lifecycle='confirmed' and e.cut_into_slices_at is null;
      if i.qty<1 or v_count<i.qty then raise exception 'Fresh Pick items must match linked physical stock'; end if;
    end loop;
    return null;
  end if;
  -- Item INSERT / selection UPDATE was already checked immediately. This
  -- guard checks retained selections only when the order date actually changes.
  if tg_table_name<>'orders' or tg_op<>'UPDATE' then return null; end if;
  if new.pickup_date is not distinct from old.pickup_date
    and new.extra_stock_id is not distinct from old.extra_stock_id then return null; end if;
  if o.pickup_date is null then raise exception 'Select a valid pickup date'; end if;
  for i in select * from public.order_items where order_id=o.id loop
    select cs.available_from,cs.available_until,cs.label,c.name into s
      from public.library_cake_sizes cs join public.library_cakes c on c.id=cs.cake_id
      where cs.id=i.cake_size_id and cs.cake_id=i.cake_id for share of cs;
    if not found then raise exception 'Cake size is not available'; end if;
    if s.available_from is not null and o.pickup_date<s.available_from then
      raise exception '% %: Available from %. Choose another size or pickup date.',s.name,s.label,to_char(s.available_from,'FMDD Mon YYYY'); end if;
    if s.available_until is not null and o.pickup_date>s.available_until then
      raise exception '% %: Available until %. Choose another size or pickup date.',s.name,s.label,to_char(s.available_until,'FMDD Mon YYYY'); end if;
  end loop;
  return null;
end $function$;
ALTER FUNCTION public.enforce_order_size_availability_final() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_order_size_availability_final() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.enforce_preorder_size_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_date date; v_stock uuid; v_from date; v_until date; v_label text; v_name text;
begin
  if tg_op = 'UPDATE' and new.order_id is not distinct from old.order_id
     and new.cake_id is not distinct from old.cake_id
     and new.cake_size_id is not distinct from old.cake_size_id then return new; end if;
  select pickup_date, extra_stock_id into v_date,v_stock from public.orders
    where id=new.order_id for share;
  if not found then raise exception 'Order is not available'; end if;
  -- Physical stock is verified by the deferred linkage guard, after checkout
  -- has finished assigning every stock row to the order.
  if v_stock is not null then return new; end if;
  select s.available_from,s.available_until,s.label,c.name
    into v_from,v_until,v_label,v_name from public.library_cake_sizes s
    join public.library_cakes c on c.id=s.cake_id
    where s.id=new.cake_size_id and s.cake_id=new.cake_id for share of s;
  if not found then raise exception 'Cake size is not available'; end if;
  if v_date is null then raise exception 'Select a valid pickup date'; end if;
  if v_from is not null and v_date<v_from then
    raise exception '% %: Available from %. Choose another size or pickup date.',v_name,v_label,to_char(v_from,'FMDD Mon YYYY'); end if;
  if v_until is not null and v_date>v_until then
    raise exception '% %: Available until %. Choose another size or pickup date.',v_name,v_label,to_char(v_until,'FMDD Mon YYYY'); end if;
  return new;
end $function$;
ALTER FUNCTION public.enforce_preorder_size_availability() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_preorder_size_availability() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.extra_walk_in_hold_is_active(p_held_until timestamp with time zone, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  select p_held_until is not null and p_held_until >= p_at;
$function$;
ALTER FUNCTION public.extra_walk_in_hold_is_active(timestamp with time zone,timestamp with time zone) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.extra_walk_in_hold_is_active(timestamp with time zone,timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extra_walk_in_hold_is_active(timestamp with time zone,timestamp with time zone) TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.order_adjustments_total(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(oa.amount), 0)::numeric(10, 2)
  from public.order_adjustments oa
  where oa.order_id = p_order_id;
$function$;
ALTER FUNCTION public.order_adjustments_total(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_adjustments_total(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_adjustments_total(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.order_items_subtotal(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(oi.unit_price * oi.quantity), 0)::numeric(10, 2)
  from public.order_items oi
  where oi.order_id = p_order_id;
$function$;
ALTER FUNCTION public.order_items_subtotal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_items_subtotal(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_items_subtotal(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.order_paid_addons_subtotal(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(opa.unit_price * opa.quantity), 0)::numeric(10, 2)
  from public.order_paid_addons opa
  where opa.order_id = p_order_id;
$function$;
ALTER FUNCTION public.order_paid_addons_subtotal(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_paid_addons_subtotal(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_paid_addons_subtotal(uuid) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.order_refunds_total(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(r.amount), 0)::numeric(10, 2)
  from public.refunds r
  where r.order_id = p_order_id
    and r.status = 'recorded';
$function$;
ALTER FUNCTION public.order_refunds_total(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_refunds_total(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_refunds_total(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.order_verified_allocated(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(coalesce(pc.corrected_amount, pa.amount)), 0)::numeric(10, 2)
  from public.payment_allocations pa
  inner join public.payments p on p.id = pa.payment_id
  left join public.payment_corrections pc
    on pc.payment_allocation_id = pa.id
  where pa.order_id = p_order_id
    and p.status = 'verified';
$function$;
ALTER FUNCTION public.order_verified_allocated(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_verified_allocated(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_verified_allocated(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.prevent_direct_order_payment_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'UPDATE'
     and (
       NEW.payment_status is distinct from OLD.payment_status
       or (NEW.status is distinct from OLD.status and NEW.status = 'paid')
     )
     and current_user in ('authenticated', 'anon')
  then
    raise exception
      'Payment status can only be changed through the verified payment workflow';
  end if;
  return NEW;
end;
$function$;
ALTER FUNCTION public.prevent_direct_order_payment_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_direct_order_payment_mutation() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_direct_order_payment_mutation() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.prevent_payment_correction_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Payment correction history is append-only';
end;
$function$;
ALTER FUNCTION public.prevent_payment_correction_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_payment_correction_mutation() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_payment_correction_mutation() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.reject_staff_notification_event_created_at_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Staff notification event created_at is immutable.';
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public.reject_staff_notification_event_created_at_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_staff_notification_event_created_at_update() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.release_catalogue_voucher_redemptions_for_order(p_order_id uuid, p_actor_staff_id uuid, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_count integer := 0;
begin
  if p_order_id is null then
    return 0;
  end if;
  if v_reason is null then
    v_reason := 'order_cancelled';
  end if;

  update public.catalogue_voucher_redemptions
  set
    status = 'released',
    released_at = now(),
    release_reason = v_reason,
    released_by = p_actor_staff_id
  where order_id = p_order_id
    and status = 'redeemed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
ALTER FUNCTION public.release_catalogue_voucher_redemptions_for_order(uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_catalogue_voucher_redemptions_for_order(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_catalogue_voucher_redemptions_for_order(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
ALTER FUNCTION public.set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_email_delivery_is_paused()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ select true $function$;
ALTER FUNCTION public.staff_notification_email_delivery_is_paused() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_email_delivery_is_paused() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_vault_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(decrypted_secret), '')
  from vault.decrypted_secrets
  where name = p_name
  limit 1;
$function$;
ALTER FUNCTION public.staff_notification_vault_secret(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_vault_secret(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_vault_secret(text) TO service_role;
CREATE OR REPLACE FUNCTION public.staff_profiles_enforce_master_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_role_code text;
  v_transfer_ok text;
begin
  v_transfer_ok := current_setting('app.allow_master_transfer', true);

  if tg_op = 'INSERT' then
    if new.is_master_owner and v_transfer_ok is distinct from 'on' then
      raise exception 'Master Owner status can only change through transfer';
    end if;
  elsif old.is_master_owner is distinct from new.is_master_owner then
    if v_transfer_ok is distinct from 'on' then
      raise exception 'Master Owner status can only change through transfer';
    end if;
  end if;

  if not new.is_master_owner then
    return new;
  end if;

  if not new.is_active then
    raise exception 'Master Owner must remain active';
  end if;

  select r.code into v_role_code
  from public.roles r
  where r.id = new.role_id;

  if v_role_code is distinct from 'owner' then
    raise exception 'Master Owner must have the Owner role';
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public.staff_profiles_enforce_master_owner() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_profiles_enforce_master_owner() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_profiles_enforce_master_owner() TO service_role;
CREATE OR REPLACE FUNCTION public._extra_stock_event_on_order_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' and new.extra_stock_id is not null then
    perform public._record_extra_stock_event(
      new.extra_stock_id,
      'sold',
      null,
      jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'source', 'order_link'
      )
    );
  elsif tg_op = 'UPDATE'
    and old.extra_stock_id is null
    and new.extra_stock_id is not null
  then
    perform public._record_extra_stock_event(
      new.extra_stock_id,
      'sold',
      null,
      jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'source', 'order_link'
      )
    );
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public._extra_stock_event_on_order_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._extra_stock_event_on_order_link() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._extra_stock_event_on_order_link() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._extra_stock_event_on_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    perform public._record_extra_stock_event(
      new.id,
      'created',
      new.proposed_by,
      jsonb_build_object('lifecycle', new.lifecycle)
    );
    if new.lifecycle = 'confirmed' then
      perform public._record_extra_stock_event(
        new.id,
        'confirmed',
        new.confirmed_by,
        jsonb_build_object('prepared_on', new.prepared_on)
      );
    end if;
    return new;
  end if;

  if old.lifecycle is distinct from new.lifecycle then
    if new.lifecycle = 'confirmed' then
      perform public._record_extra_stock_event(
        new.id,
        'confirmed',
        new.confirmed_by,
        jsonb_build_object('prepared_on', new.prepared_on)
      );
    elsif new.lifecycle = 'rejected' then
      perform public._record_extra_stock_event(
        new.id,
        'rejected',
        new.rejected_by,
        jsonb_build_object('reason', new.reject_reason)
      );
    end if;
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public._extra_stock_event_on_row() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._extra_stock_event_on_row() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._extra_stock_event_on_row() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._extra_stock_guard_walk_in_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.extra_walk_in_hold_is_active(old.walk_in_held_until) then
    return new;
  end if;

  if new.sold_at is distinct from old.sold_at
     or new.cut_into_slices_at is distinct from old.cut_into_slices_at
     or new.lifecycle is distinct from old.lifecycle
     or new.pickup_available_from_at is distinct from old.pickup_available_from_at
     or new.pickup_through_at is distinct from old.pickup_through_at
     or new.prepared_on is distinct from old.prepared_on
     or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by
  then
    raise exception 'This Fresh Pick is currently on walk-in hold.';
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public._extra_stock_guard_walk_in_hold() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._extra_stock_guard_walk_in_hold() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._extra_stock_guard_walk_in_hold() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.assign_extra_stock_to_order(p_extra_stock_id uuid, p_order_id uuid, p_actor_staff_id uuid)
 RETURNS extra_stock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  stock_row public.extra_stock;
  order_row public.orders;
  primary_stock public.extra_stock;
  v_matching_item_count integer;
  v_matching_item_quantity bigint;
  v_allocated_matching_stock_count bigint;
  v_updated integer;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  v_role := public._staff_role_code(v_actor);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to assign EXTRA';
  end if;

  -- Lock stock first so competing calls cannot allocate this physical item twice.
  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only confirmed Fresh Pick stock can be assigned';
  end if;
  if stock_row.sold_at is not null or stock_row.order_id is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;
  if stock_row.walk_in_held_until is not null and stock_row.walk_in_held_until >= v_now then
    raise exception 'This Fresh Pick is currently on walk-in hold';
  end if;

  -- Serializing all assignments for an order makes quantity checks safe when
  -- multiple staff assign different physical stock to the same order at once.
  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  -- Refresh the time after lock waits so stock expiry/hold checks are current.
  v_now := clock_timestamp();
  if order_row.status in ('cancelled', 'completed') then
    raise exception 'Cannot assign Fresh Pick stock to a cancelled or completed order';
  end if;
  if order_row.picked_up_at is not null
     or order_row.out_for_delivery_at is not null
     or order_row.delivered_at is not null then
    raise exception 'Cannot assign Fresh Pick stock after collection or delivery handoff';
  end if;

  -- Do not permit a second order to claim the order's legacy primary stock link.
  if exists (
    select 1
    from public.orders other_order
    where other_order.extra_stock_id = p_extra_stock_id
      and other_order.id <> p_order_id
  ) then
    raise exception 'This Fresh Pick is already linked to another order';
  end if;
  if order_row.extra_stock_id = p_extra_stock_id then
    raise exception 'This Fresh Pick is already assigned to that order';
  end if;

  -- Existing primary links must remain internally plausible. A legacy primary
  -- link with order_id NULL is still counted below, but a link to another order
  -- is an unexplained conflict and fails closed.
  if order_row.extra_stock_id is not null then
    select e.*
    into primary_stock
    from public.extra_stock e
    where e.id = order_row.extra_stock_id;

    if not found then
      raise exception 'The order has an invalid existing Fresh Pick link';
    end if;
    if primary_stock.order_id is not null and primary_stock.order_id <> p_order_id then
      raise exception 'The order has a conflicting existing Fresh Pick link';
    end if;
    if primary_stock.lifecycle <> 'confirmed'
       or primary_stock.sold_at is null
       or primary_stock.cut_into_slices_at is not null then
      raise exception 'The order has an incomplete existing Fresh Pick allocation';
    end if;
  end if;

  if exists (
    select 1
    from public.extra_stock linked
    where linked.order_id = p_order_id
      and (
        linked.lifecycle <> 'confirmed'
        or linked.sold_at is null
        or linked.cut_into_slices_at is not null
      )
  ) then
    raise exception 'The order has an incomplete existing Fresh Pick allocation';
  end if;

  -- Match catalogue ids strictly when the physical stock has them. Preserve
  -- the established normalized-name fallback only for legacy stock without ids.
  select count(*)::integer, coalesce(sum(oi.quantity), 0)::bigint
  into v_matching_item_count, v_matching_item_quantity
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      (stock_row.library_cake_id is not null and oi.cake_id = stock_row.library_cake_id)
      or (
        stock_row.library_cake_id is null
        and lower(trim(oi.cake_name)) = lower(trim(stock_row.cake_name))
      )
    )
    and (
      (stock_row.library_cake_size_id is not null and oi.cake_size_id = stock_row.library_cake_size_id)
      or (
        stock_row.library_cake_size_id is null
        and lower(trim(oi.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  if v_matching_item_count = 0 or v_matching_item_quantity = 0 then
    raise exception 'This order has no remaining cake line matching this Fresh Pick';
  end if;

  -- Count distinct physical stock units linked through the one-to-many stock
  -- relation plus the legacy primary pointer. The OR returns each row once.
  select count(*)::bigint
  into v_allocated_matching_stock_count
  from public.extra_stock linked
  where (linked.order_id = p_order_id or linked.id = order_row.extra_stock_id)
    and (
      (
        stock_row.library_cake_id is not null
        and linked.library_cake_id is not null
        and linked.library_cake_id = stock_row.library_cake_id
      )
      or (
        (stock_row.library_cake_id is null or linked.library_cake_id is null)
        and lower(trim(linked.cake_name)) = lower(trim(stock_row.cake_name))
      )
    )
    and (
      (
        stock_row.library_cake_size_id is not null
        and linked.library_cake_size_id is not null
        and linked.library_cake_size_id = stock_row.library_cake_size_id
      )
      or (
        (stock_row.library_cake_size_id is null or linked.library_cake_size_id is null)
        and lower(trim(linked.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  if v_allocated_matching_stock_count >= v_matching_item_quantity then
    raise exception 'All matching cake quantities on this order already have physical stock assigned';
  end if;

  -- Assignment and audit writes are in this RPC transaction. If any later write
  -- or deferred constraint fails, PostgreSQL rolls all of them back.
  update public.extra_stock e
  set order_id = p_order_id,
      sold_at = v_now,
      updated_at = v_now
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.order_id is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed'
    and (e.walk_in_held_until is null or e.walk_in_held_until < v_now);

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick is no longer available for assignment';
  end if;

  -- Keep the established single primary pointer; subsequent physical units are
  -- represented by extra_stock.order_id and remain visible per stock record.
  if order_row.extra_stock_id is null then
    update public.orders o
    set extra_stock_id = p_extra_stock_id,
        updated_at = v_now
    where o.id = p_order_id
      and o.extra_stock_id is null;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'The order changed while this Fresh Pick was being assigned';
    end if;
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_order_id,
    'extra_assigned',
    v_actor,
    jsonb_build_object(
      'extra_stock_id', p_extra_stock_id,
      'matching_item_count', v_matching_item_count,
      'matching_item_quantity', v_matching_item_quantity,
      'previously_allocated_matching_stock_count', v_allocated_matching_stock_count,
      'inserted_order_item', false
    )
  );

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'assigned',
    v_actor,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', order_row.order_number,
      'matching_item_count', v_matching_item_count,
      'matching_item_quantity', v_matching_item_quantity,
      'previously_allocated_matching_stock_count', v_allocated_matching_stock_count,
      'inserted_order_item', false
    )
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id;
  return stock_row;
end;
$function$;
ALTER FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) TO service_role, authenticated;
CREATE OR REPLACE FUNCTION public.cut_extra_stock_into_slices(p_extra_stock_id uuid, p_actor_staff_id uuid)
 RETURNS extra_stock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_staff_id uuid;
  v_role text;
  stock_row public.extra_stock;
BEGIN
  IF p_extra_stock_id IS NULL THEN
    RAISE EXCEPTION 'EXTRA stock is required';
  END IF;
  IF p_actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff actor is required';
  END IF;

  v_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);
  v_role := public._staff_role_code(v_actor_staff_id);
  IF v_role IS NULL OR v_role NOT IN ('bakery', 'manager', 'owner') THEN
    RAISE EXCEPTION 'Not authorized to cut EXTRA into slices';
  END IF;

  SELECT e.*
  INTO stock_row
  FROM public.extra_stock e
  WHERE e.id = p_extra_stock_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXTRA stock not found';
  END IF;

  IF stock_row.lifecycle <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed Fresh Pick can be cut into slices';
  END IF;
  IF stock_row.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cut a sold Extra into slices';
  END IF;
  IF stock_row.cut_into_slices_at IS NOT NULL THEN
    RAISE EXCEPTION 'This Extra was already cut into slices';
  END IF;

  UPDATE public.extra_stock e
  SET
    cut_into_slices_at = now(),
    cut_into_slices_by = v_actor_staff_id,
    updated_at = now()
  WHERE e.id = p_extra_stock_id
    AND e.sold_at IS NULL
    AND e.cut_into_slices_at IS NULL
    AND e.lifecycle = 'confirmed'
  RETURNING * INTO stock_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot cut this Fresh Pick into slices';
  END IF;

  PERFORM public._record_extra_stock_event(
    p_extra_stock_id,
    'cut_into_slices',
    v_actor_staff_id,
    '{}'::jsonb
  );

  RETURN stock_row;
END;
$function$;
ALTER FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.order_amount_due(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(
    public.order_items_subtotal(p_order_id)
      + public.order_paid_addons_subtotal(p_order_id)
      + public.order_adjustments_total(p_order_id),
    0
  )::numeric(10, 2);
$function$;
ALTER FUNCTION public.order_amount_due(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_amount_due(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_amount_due(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.order_net_received(p_order_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    public.order_verified_allocated(p_order_id)
    - public.order_refunds_total(p_order_id)
  )::numeric(10, 2);
$function$;
ALTER FUNCTION public.order_net_received(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.order_net_received(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_net_received(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_dispatch_headers(p_include_json boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  dispatch_secret text;
  bypass text;
  headers jsonb;
begin
  dispatch_secret := public.staff_notification_vault_secret(
    'staff_notification_dispatch_secret'
  );
  if dispatch_secret is null then
    return null;
  end if;

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || dispatch_secret
  );
  if p_include_json then
    headers := headers || jsonb_build_object('Content-Type', 'application/json');
  end if;

  bypass := public.staff_notification_vault_secret(
    'staff_notification_vercel_protection_bypass'
  );
  if bypass is not null then
    headers := headers || jsonb_build_object(
      'x-vercel-protection-bypass', bypass
    );
  end if;

  return headers;
end;
$function$;
ALTER FUNCTION public.staff_notification_dispatch_headers(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_dispatch_headers(boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_dispatch_headers(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_emit_new_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders;
  v_items jsonb;
  v_addons jsonb;
  v_delivery jsonb;
  v_dine jsonb;
  v_total numeric;
  v_first jsonb;
  v_more integer;
  v_cake_summary text;
  v_description text;
  v_payload jsonb;
  v_label text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return null;
  end if;
  if o.status is distinct from 'submitted' then
    return null;
  end if;
  if o.extra_stock_id is not null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cakeName', oi.cake_name,
        'sizeLabel', oi.size_label,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price,
        'lineTotal', oi.quantity * oi.unit_price
      )
      order by oi.created_at
    ),
    '[]'::jsonb
  )
  into v_items
  from public.order_items oi
  where oi.order_id = o.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', pa.name,
        'quantity', pa.quantity,
        'unitPrice', pa.unit_price,
        'lineTotal', pa.quantity * pa.unit_price
      )
      order by pa.sort_order, pa.created_at
    ),
    '[]'::jsonb
  )
  into v_addons
  from public.order_paid_addons pa
  where pa.order_id = o.id;

  select
    coalesce(sum(oi.quantity * oi.unit_price), 0)
    + coalesce(
      (select sum(pa.quantity * pa.unit_price)
       from public.order_paid_addons pa
       where pa.order_id = o.id),
      0
    )
  into v_total
  from public.order_items oi
  where oi.order_id = o.id;

  select jsonb_build_object(
    'recipientName', d.recipient_name,
    'recipientPhone', d.recipient_phone,
    'addressLine1', d.address_line_1,
    'addressLine2', d.address_line_2,
    'postcode', d.postcode,
    'city', d.city,
    'state', d.state
  )
  into v_delivery
  from public.order_delivery_details d
  where d.order_id = o.id;

  select jsonb_build_object(
    'venue', r.venue::text,
    'guestCount', r.guest_count,
    'reservationTime', to_char(r.reservation_time, 'HH24:MI')
  )
  into v_dine
  from public.order_dine_in_reservations r
  where r.order_id = o.id;

  v_label := public._staff_notification_fulfilment_label(o.fulfilment_method);
  v_first := case when jsonb_array_length(v_items) > 0 then v_items -> 0 else null end;
  if v_first is not null then
    v_cake_summary := public._staff_notification_cake_display(
      v_first ->> 'cakeName',
      v_first ->> 'sizeLabel'
    );
    if v_cake_summary is not null then
      v_cake_summary := v_cake_summary || ' × ' || coalesce(v_first ->> 'quantity', '1');
      v_more := jsonb_array_length(v_items) - 1;
      if v_more > 0 then
        v_cake_summary := v_cake_summary || ' + ' || v_more || ' more';
      end if;
    end if;
  end if;

  v_description := concat_ws(
    E'\n',
    concat_ws(
      ' · ',
      nullif(trim(coalesce(o.guest_name, '')), ''),
      nullif(trim(coalesce(v_cake_summary, '')), ''),
      o.pickup_date::text,
      v_label
    ),
    nullif(trim(coalesce(o.order_number, '')), '')
  );

  v_payload := jsonb_build_object(
    'guestName', o.guest_name,
    'guestPhone', o.guest_phone,
    'cakeName', v_first ->> 'cakeName',
    'pickupDate', o.pickup_date,
    'pickupTime', to_char(o.pickup_time, 'HH24:MI'),
    'orderNumber', o.order_number,
    'orderSource', o.order_source,
    'fulfilmentMethod', o.fulfilment_method::text,
    'fulfilmentLabel', v_label,
    'notes', o.customer_notes,
    'items', v_items,
    'addons', v_addons,
    'total', v_total,
    'delivery', v_delivery,
    'dineIn', v_dine
  );

  return public.emit_staff_notification_event(
    'new_order:' || o.id::text,
    'new_order',
    o.id,
    null,
    'New order received',
    v_description,
    '/owner/orders/' || o.id::text,
    v_payload
  );
end;
$function$;
ALTER FUNCTION public.staff_notification_emit_new_order(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_emit_new_order(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_emit_new_order(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_on_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cake_name text;
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  v_cake_name := public._staff_notification_order_cake_name(new.id);
  v_href := '/owner/orders/' || new.id::text;
  v_description := public._staff_notification_order_description(
    new.guest_name,
    v_cake_name,
    new.pickup_date,
    new.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', new.guest_name,
    'cakeName', v_cake_name,
    'pickupDate', new.pickup_date,
    'orderNumber', new.order_number,
    'orderSource', new.order_source
  );

  if tg_op = 'INSERT' then
    if new.status is distinct from 'cancelled' then
      if new.order_source = 'last_minute' then
        perform public.emit_staff_notification_event(
          'last_minute:' || new.id::text,
          'last_minute',
          new.id,
          null,
          'Last-minute order',
          v_description,
          v_href,
          v_payload
        );
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform public.emit_staff_notification_event(
        'order_cancelled:' || new.id::text,
        'order_cancelled',
        new.id,
        null,
        'Order cancelled',
        v_description,
        v_href,
        v_payload
      );
      return new;
    end if;

    if new.status = 'cancelled' then
      return new;
    end if;

    if (
      new.status = 'paid'
      or new.payment_status = 'paid'
    )
      and not (
        old.status = 'paid'
        or old.payment_status = 'paid'
      )
    then
      perform public.emit_staff_notification_event(
        'order_paid:' || new.id::text,
        'order_paid',
        new.id,
        null,
        'Order paid',
        v_description,
        v_href,
        v_payload
      );
    end if;

    if new.order_source = 'last_minute'
      and old.order_source is distinct from 'last_minute'
    then
      perform public.emit_staff_notification_event(
        'last_minute:' || new.id::text,
        'last_minute',
        new.id,
        null,
        'Last-minute order',
        v_description,
        v_href,
        v_payload
      );
    end if;
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification orders trigger failed: %', sqlerrm;
    return new;
end;
$function$;
ALTER FUNCTION public.staff_notification_on_orders() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_on_orders() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_on_orders() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_on_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_row public.orders;
  v_cake_name text;
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  select *
    into order_row
  from public.orders
  where id = new.order_id;

  if not found then
    return new;
  end if;

  if order_row.status = 'cancelled' then
    return new;
  end if;

  v_cake_name := public._staff_notification_order_cake_name(order_row.id);
  v_href := '/owner/orders/' || order_row.id::text;
  v_description := public._staff_notification_order_description(
    order_row.guest_name,
    v_cake_name,
    order_row.pickup_date,
    order_row.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', order_row.guest_name,
    'cakeName', v_cake_name,
    'pickupDate', order_row.pickup_date,
    'orderNumber', order_row.order_number
  );

  if new.event_type = 'customer_confirmed' then
    perform public.emit_staff_notification_event(
      'order_confirmed:' || order_row.id::text,
      'order_confirmed',
      order_row.id,
      null,
      'Order confirmed',
      v_description,
      v_href,
      v_payload
    );
  elsif new.event_type = 'order_updated' then
    perform public.emit_staff_notification_event(
      'order_edited:' || new.id::text,
      'order_edited',
      order_row.id,
      null,
      'Order edited',
      v_description,
      v_href,
      v_payload
    );
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification timeline trigger failed: %', sqlerrm;
    return new;
end;
$function$;
ALTER FUNCTION public.staff_notification_on_timeline() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_on_timeline() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_on_timeline() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.trg_release_catalogue_voucher_on_order_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.release_catalogue_voucher_redemptions_for_order(
      new.id,
      new.updated_by,
      'order_cancelled'
    );
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public.trg_release_catalogue_voucher_on_order_cancel() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_release_catalogue_voucher_on_order_cancel() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_release_catalogue_voucher_on_order_cancel() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._fresh_pick_order_is_fully_paid(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    o.status = 'paid'
      and o.payment_status = 'paid'
      and public.order_net_received(o.id) >= public.order_amount_due(o.id),
    false
  )
  from public.orders o
  where o.id = p_order_id;
$function$;
ALTER FUNCTION public._fresh_pick_order_is_fully_paid(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._fresh_pick_order_is_fully_paid(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._release_fresh_pick_after_guest_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  released_stock record;
begin
  -- Walk-in sales share the stock/order relationship but retain their own lifecycle.
  -- Only unpaid customer website Fresh Picks are automatically released.
  if new.order_source = 'customer_website'
     and new.extra_stock_id is not null
     and public.order_net_received(new.id) <= 0 then
    for released_stock in
      update public.extra_stock e
      set order_id = null,
          sold_at = null,
          updated_at = now()
      where e.order_id = new.id
        and e.sold_at is not null
        and e.lifecycle = 'confirmed'
        and e.cut_into_slices_at is null
      returning e.id
    loop
      perform public._record_extra_stock_event(
        released_stock.id,
        'released',
        new.updated_by,
        jsonb_build_object(
          'order_id', new.id,
          'order_number', new.order_number,
          'reason', 'customer_order_cancelled'
        )
      );
    end loop;
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public._release_fresh_pick_after_guest_cancel() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._release_fresh_pick_after_guest_cancel() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._release_fresh_pick_after_guest_cancel() TO service_role;
CREATE OR REPLACE FUNCTION public.assert_refund_within_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_remaining numeric(10, 2);
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  if new.refund_type = 'fresh_pick_cancellation' then
    if not exists (
      select 1
      from public.orders o
      where o.id = new.order_id
        and o.extra_stock_id is not null
        and o.status = 'paid'
        and o.payment_status = 'paid'
    ) then
      raise exception 'Fresh Pick cancellation refund requires a paid Fresh Pick order';
    end if;
    if new.amount <> public.order_net_received(new.order_id) then
      raise exception 'Fresh Pick cancellation refund must equal the remaining net received amount';
    end if;
    return new;
  end if;

  if new.refund_type = 'order_refund' then
    v_remaining := greatest(
      public.order_verified_allocated(new.order_id)
        - public.order_refunds_total(new.order_id),
      0
    )::numeric(10, 2);
    if new.amount > v_remaining then
      raise exception 'Refund exceeds remaining verified receipts';
    end if;
    return new;
  end if;

  if new.refund_type <> 'overpayment_correction' then
    raise exception 'Unsupported refund type';
  end if;
  if public.order_verified_allocated(new.order_id) <= 0 then
    raise exception 'This order has no verified payment to correct';
  end if;

  v_remaining := greatest(
    public.order_verified_allocated(new.order_id)
      - public.order_amount_due(new.order_id)
      - public.order_refunds_total(new.order_id),
    0
  )::numeric(10, 2);
  if new.amount > v_remaining then
    raise exception 'Refund exceeds remaining overpayment';
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public.assert_refund_within_overpayment() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_refund_within_overpayment() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_emit_new_order_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.staff_notification_emit_new_order(new.id);
  return new;
exception
  when others then
    raise warning 'staff notification new_order emit failed: %', sqlerrm;
    return new;
end;
$function$;
ALTER FUNCTION public.staff_notification_emit_new_order_row() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_emit_new_order_row() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_emit_new_order_row() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.staff_notification_request_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cfg public.staff_notification_dispatch_config; headers jsonb;
begin
 if public.staff_notification_email_delivery_is_paused() then return new; end if;
 select * into cfg from public.staff_notification_dispatch_config where id=true;
 if cfg.dispatch_url is null or btrim(cfg.dispatch_url)='' or cfg.per_event_enabled is not true then return new; end if;
 headers:=public.staff_notification_dispatch_headers(true);
 if headers is null then return new; end if;
 begin
  perform net.http_post(url:=btrim(cfg.dispatch_url),body:=jsonb_build_object('eventId',new.id::text),headers:=headers);
 exception when undefined_function then null; when undefined_object then null;
 when others then raise warning 'staff notification pg_net dispatch failed: %',sqlerrm;
 end;
 return new;
exception when others then raise warning 'staff notification dispatch trigger failed: %',sqlerrm; return new;
end
$function$;
ALTER FUNCTION public.staff_notification_request_dispatch() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.staff_notification_request_dispatch() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_notification_request_dispatch() TO PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._guard_fresh_pick_order_readiness_and_handoff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_fresh_pick boolean;
  v_fully_paid boolean;
  v_stock_ready boolean;
begin
  is_fresh_pick :=
    new.customer_id is null
    and new.order_source = 'customer_website'
    and new.extra_stock_id is not null;

  if not is_fresh_pick then
    return new;
  end if;

  v_fully_paid := public._fresh_pick_order_is_fully_paid(new.id);
  v_stock_ready := public._fresh_pick_order_items_are_ready(new.id);

  if new.ready_at is not null
    and (
      new.status is distinct from 'paid'
      or new.payment_status is distinct from 'paid'
      or public.order_net_received(new.id) < public.order_amount_due(new.id)
      or not v_stock_ready
    )
  then
    raise exception 'Fresh Pick order must be fully paid and all linked stock ready';
  end if;

  if (
    (old.picked_up_at is null and new.picked_up_at is not null)
    or (old.out_for_delivery_at is null and new.out_for_delivery_at is not null)
    or (old.delivered_at is null and new.delivered_at is not null)
  ) and (
    not v_fully_paid
    or not v_stock_ready
    or new.ready_at is null
  ) then
    raise exception 'Fresh Pick handoff requires full payment and ready linked stock';
  end if;

  return new;
end;
$function$;
ALTER FUNCTION public._guard_fresh_pick_order_readiness_and_handoff() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._guard_fresh_pick_order_readiness_and_handoff() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._sync_fresh_pick_order_readiness_unheld_impl(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_row public.orders;
  v_ready_at timestamptz;
  v_stock_ids uuid[];
  v_item_quantity bigint;
  v_fully_paid boolean;
  v_stock_ready boolean;
  v_order_eligible boolean;
  v_previous_ready_at timestamptz;
  v_previous_ready_by uuid;
begin
  if p_order_id is null then
    return;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found
    or order_row.customer_id is not null
    or order_row.order_source is distinct from 'customer_website'
    or order_row.extra_stock_id is null
  then
    return;
  end if;

  v_order_eligible :=
    order_row.fulfilment_method in ('pickup', 'delivery', 'dine_in')
    and order_row.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
    and order_row.picked_up_at is null
    and order_row.out_for_delivery_at is null
    and order_row.delivered_at is null
    and order_row.production_started_at is null;

  v_fully_paid := public._fresh_pick_order_is_fully_paid(p_order_id);
  v_stock_ready := public._fresh_pick_order_items_are_ready(p_order_id);

  if v_order_eligible and v_fully_paid and v_stock_ready then
    if order_row.ready_at is not null then
      return;
    end if;

    select array_agg(e.id order by e.id)
    into v_stock_ids
    from public.extra_stock e
    where e.order_id = p_order_id;

    select coalesce(sum(oi.quantity), 0)::bigint
    into v_item_quantity
    from public.order_items oi
    where oi.order_id = p_order_id;

    v_ready_at := clock_timestamp();
    update public.orders o
    set ready_at = v_ready_at,
        ready_by = null,
        updated_at = v_ready_at
    where o.id = p_order_id
      and o.ready_at is null
    returning * into order_row;

    if not found then
      return;
    end if;

    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      p_order_id,
      'order_marked_ready',
      null,
      jsonb_build_object(
        'ready_at', order_row.ready_at,
        'source', 'fully_paid_prepared_fresh_pick_stock',
        'extra_stock_ids', to_jsonb(coalesce(v_stock_ids, array[]::uuid[])),
        'item_quantity', v_item_quantity,
        'amount_due', public.order_amount_due(p_order_id),
        'net_received', public.order_net_received(p_order_id)
      )
    );
    return;
  end if;

  -- Revoke only an unhanded Fresh Pick readiness assertion. Completed handoffs
  -- remain historical facts if payment is corrected or refunded afterward.
  if order_row.ready_at is null then
    return;
  end if;

  if v_fully_paid and (
    order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  ) then
    return;
  end if;

  v_previous_ready_at := order_row.ready_at;
  v_previous_ready_by := order_row.ready_by;

  update public.orders o
  set ready_at = null,
      ready_by = null,
      updated_at = clock_timestamp()
  where o.id = p_order_id
    and o.ready_at is not null;

  if not found then
    return;
  end if;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'order_ready_undone',
    null,
    jsonb_build_object(
      'previous_ready_at', v_previous_ready_at,
      'previous_ready_by', v_previous_ready_by,
      'reason', case
        when not v_fully_paid then 'fresh_pick_not_fully_settled'
        when not v_stock_ready then 'fresh_pick_stock_not_ready'
        else 'fresh_pick_order_not_eligible'
      end,
      'source', 'fresh_pick_readiness_reconciliation',
      'amount_due', public.order_amount_due(p_order_id),
      'net_received', public.order_net_received(p_order_id)
    )
  );
end;
$function$;
ALTER FUNCTION public._sync_fresh_pick_order_readiness_unheld_impl(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._sync_fresh_pick_order_readiness_unheld_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._sync_fresh_pick_order_readiness(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  if exists (
    select 1
    from public.fresh_pick_readiness_undo_holds h
    where h.order_id = p_order_id
  ) then
    return;
  end if;
  perform public._sync_fresh_pick_order_readiness_unheld_impl(p_order_id);
end;
$function$;
ALTER FUNCTION public._sync_fresh_pick_order_readiness(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._sync_fresh_pick_order_readiness(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_order_readiness_after_items_change_unheld_impl(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  order_row public.orders;
  previous_ready_at timestamptz;
  previous_ready_by uuid;
begin
  if p_order_id is null then
    return;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return;
  end if;

  if public._fresh_pick_order_items_are_ready(p_order_id) then
    perform public._sync_fresh_pick_order_readiness(p_order_id);
    return;
  end if;

  -- A material cake-item amendment invalidates an order-level Ready assertion.
  -- Terminal/cancelled history is retained; Collection already excludes it.
  if order_row.ready_at is null
    or order_row.status = 'cancelled'
    or order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  then
    return;
  end if;

  previous_ready_at := order_row.ready_at;
  previous_ready_by := order_row.ready_by;

  update public.orders o
  set ready_at = null,
      ready_by = null,
      updated_at = clock_timestamp()
  where o.id = p_order_id
    and o.ready_at is not null;

  if not found then
    return;
  end if;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'order_ready_undone',
    order_row.updated_by,
    jsonb_build_object(
      'previous_ready_at', previous_ready_at,
      'previous_ready_by', previous_ready_by,
      'reason', 'required_items_changed',
      'source', 'order_items'
    )
  );
end;
$function$;
ALTER FUNCTION public._reconcile_order_readiness_after_items_change_unheld_impl(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_order_readiness_after_items_change_unheld_impl(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._sync_fresh_pick_after_relevant_event(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  delete from public.fresh_pick_readiness_undo_holds h
  where h.order_id = p_order_id;
  perform public._sync_fresh_pick_order_readiness(p_order_id);
end;
$function$;
ALTER FUNCTION public._sync_fresh_pick_after_relevant_event(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._sync_fresh_pick_after_relevant_event(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_fresh_pick_readiness_after_order_linked_finance_chan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public._sync_fresh_pick_after_relevant_event(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if to_jsonb(old) is not distinct from to_jsonb(new) then
      return new;
    end if;
    if old.order_id is distinct from new.order_id then
      perform public._sync_fresh_pick_after_relevant_event(old.order_id);
    end if;
  end if;

  perform public._sync_fresh_pick_after_relevant_event(new.order_id);
  return new;
end;
$function$;
ALTER FUNCTION public._reconcile_fresh_pick_readiness_after_order_linked_finance_chan() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_fresh_pick_readiness_after_order_linked_finance_chan() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_fresh_pick_readiness_after_order_payment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status is not distinct from new.status
    and old.payment_status is not distinct from new.payment_status then
    return new;
  end if;
  perform public._sync_fresh_pick_after_relevant_event(new.id);
  return new;
end;
$function$;
ALTER FUNCTION public._reconcile_fresh_pick_readiness_after_order_payment_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_fresh_pick_readiness_after_order_payment_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_fresh_pick_readiness_after_payment_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  linked_order record;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  for linked_order in
    select distinct pa.order_id
    from public.payment_allocations pa
    where pa.payment_id = new.id
  loop
    perform public._sync_fresh_pick_after_relevant_event(linked_order.order_id);
  end loop;
  return new;
end;
$function$;
ALTER FUNCTION public._reconcile_fresh_pick_readiness_after_payment_row_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_fresh_pick_readiness_after_payment_row_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_fresh_pick_readiness_after_stock_ready_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.ready_for_collection is not distinct from new.ready_for_collection then
    return new;
  end if;
  if new.order_id is not null then
    perform public._sync_fresh_pick_after_relevant_event(new.order_id);
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public._reconcile_fresh_pick_readiness_after_stock_ready_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_fresh_pick_readiness_after_stock_ready_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_order_readiness_after_items_change(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  delete from public.fresh_pick_readiness_undo_holds h
  where h.order_id = p_order_id;
  perform public._reconcile_order_readiness_after_items_change_unheld_impl(p_order_id);
end;
$function$;
ALTER FUNCTION public._reconcile_order_readiness_after_items_change(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_order_readiness_after_items_change(uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._reconcile_order_readiness_after_item_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
    return old;
  end if;
  if tg_op = 'UPDATE'
    and old.order_id is not distinct from new.order_id
    and old.cake_id is not distinct from new.cake_id
    and old.cake_size_id is not distinct from new.cake_size_id
    and old.quantity is not distinct from new.quantity then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;
  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$function$;
ALTER FUNCTION public._reconcile_order_readiness_after_item_row_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reconcile_order_readiness_after_item_row_change() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public._sync_order_readiness_after_stock_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and old.order_id is not distinct from new.order_id then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;
  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$function$;
ALTER FUNCTION public._sync_order_readiness_after_stock_link() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._sync_order_readiness_after_stock_link() FROM PUBLIC, anon, authenticated, service_role;

-- Catalog fingerprints for pre/post migration definition and privilege checks.
ALTER TABLE public.staff_notification_dispatch_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.production_function_manifest (signature text PRIMARY KEY, definition_md5 text NOT NULL, owner text NOT NULL, security_definer boolean NOT NULL, config text[], acl text NOT NULL);
INSERT INTO public.production_function_manifest VALUES ('_bind_rpc_actor(uuid)','030d35baf1701b9740b0a4628a751016','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_extra_stock_event_on_order_link()','773404e82bb304a247a930a8f935cb0d','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_extra_stock_event_on_row()','2ba20419a6d3fa7eb961b7e89c89d669','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_extra_stock_guard_disposition()','15e9e7cdbca4233cba63256cac0c0d9a','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_extra_stock_guard_walk_in_hold()','9b3f50509a3fbe39bda33553d76487cb','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_fresh_pick_order_is_fully_paid(uuid)','0b8d5352e7c76a8f243affe2a30d28e6','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_fresh_pick_order_items_are_ready(uuid)','4a6f402727967f110d9f8615877b9e8d','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_guard_fresh_pick_customer_name()','0e2ce31deaa7ab7304e27ad1f3abff7f','postgres',false,ARRAY['search_path=pg_catalog, public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_guard_fresh_pick_order_readiness_and_handoff()','e8d6b4b6afa0dad88c3d9bcba6704e87','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_prevent_fresh_pick_assignment_after_production_start()','9dade648b6dcb6ae35b2112ae7605501','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_fresh_pick_readiness_after_order_linked_finance_chan()','7e9ff5c310b6ca8400f28ad655b543c4','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_fresh_pick_readiness_after_order_payment_change()','c167b1bd3e2a2f82236362fa68c029d9','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_fresh_pick_readiness_after_payment_row_change()','21bc736cfd99f19cf45fbc9129e3dfa5','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_fresh_pick_readiness_after_stock_ready_change()','0b5183c520f19c17d07f1c712f2dffac','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_order_readiness_after_item_row_change()','065af1bd790cfdd854082ad0663f32e7','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_order_readiness_after_items_change(uuid)','be1061de9218c93edc80c6f9e21f8266','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_reconcile_order_readiness_after_items_change_unheld_impl(uuid)','949f7965eb61ad1767a13cc95ffdc59c','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_record_extra_stock_event(uuid,text,uuid,jsonb)','f41bb33d0c9e1218618ea95c1368f6d6','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_release_fresh_pick_after_guest_cancel()','bce59983a36c489d76e1414b1faa7eb9','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_staff_notification_cake_display(text,text)','6db9b67a405085d61123d2771a270841','postgres',false,NULL,'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_staff_notification_fulfilment_label(fulfilment_method)','e34f0c85d72d3d8d25ece44988d9c879','postgres',false,NULL,'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_staff_notification_order_cake_name(uuid)','184e4de63af4463651b5392dfced66d5','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_staff_notification_order_description(text,text,date,text)','6fbbd4b1363036139e2c87ba082d4834','postgres',false,NULL,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_staff_role_code(uuid)','fd1728765205a628d3e25dd308c86820','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_sync_fresh_pick_after_relevant_event(uuid)','876b56ca2a8f4784ad48532bf3181cc0','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_sync_fresh_pick_order_readiness(uuid)','35483d1965cdd23054d6cfba71c3ba4e','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_sync_fresh_pick_order_readiness_unheld_impl(uuid)','d6cf0a2c1df6d32982d986fe14e57a69','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('_sync_order_readiness_after_stock_link()','3943cee30898067567faaa37b6ec236b','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('assert_order_delivery_details_invariant()','3ddd53a414b040c3a048bd237c449d28','postgres',false,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('assert_order_dine_in_reservation_invariant()','ae1522be20512ea2257327d19e83cac5','postgres',true,ARRAY['search_path=public, pg_temp']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('assert_refund_within_overpayment()','c7f1c4138accdb610e64c500338690f4','postgres',true,ARRAY['search_path=""']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('assign_extra_stock_to_order(uuid,uuid,uuid)','e461de90f82fce52e26b3099d90fa23e','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('cut_extra_stock_into_slices(uuid,uuid)','fd5d404ea10aaa4295e40b4253a9a1a3','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb)','29e048f6d5ba6495e5e5d44defe2c983','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('enforce_order_size_availability_final()','551dc445c36396b1b4226dd637563dbe','postgres',true,ARRAY['search_path=""']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('enforce_preorder_size_availability()','a78b75cbc2534521f88bade08ff183f5','postgres',false,ARRAY['search_path=""']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('extra_walk_in_hold_is_active(timestamp with time zone,timestamp with time zone)','d32f2a7621d47fd488e51819fa44d365','postgres',false,NULL,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_adjustments_total(uuid)','dfb796efbcbc14ae09c347213e2e0c5a','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_amount_due(uuid)','ca38d10c5e39f4bdab4247cc95a6cc08','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_items_subtotal(uuid)','be56123189f2f1eb8079dea6469c3a68','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_net_received(uuid)','f76551dbd5c1d7ad9d56606eaaf41154','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_paid_addons_subtotal(uuid)','cf9a6770e128ce9144cee7e5cd031ef8','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_refunds_total(uuid)','b7b5f809e933663a22881012a14db8e1','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('order_verified_allocated(uuid)','be2c22fdd27552ddad3757c378fdfe85','postgres',true,ARRAY['search_path=""']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('prevent_direct_order_payment_mutation()','628850bb956113b19688350948db4b8c','postgres',false,NULL,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('prevent_payment_correction_mutation()','6bd79244c48dcdda48cf55fae174c13b','postgres',false,ARRAY['search_path=""']::text[],'{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('reject_staff_notification_event_created_at_update()','882a586667d6b21a5eb7d3c474320de0','postgres',false,ARRAY['search_path=public']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('release_catalogue_voucher_redemptions_for_order(uuid,uuid,text)','50da92ab96e45779a1095dd11ca9daa9','postgres',false,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('set_updated_at()','4d6804d5850641a33867814c9e76a714','postgres',false,NULL,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_dispatch_headers(boolean)','1778bec7df5bb0e3a3e4ca7a289667b7','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_email_delivery_is_paused()','64a2af7cbf925120987b09f221bf212c','postgres',true,ARRAY['search_path=pg_catalog']::text[],'{postgres=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_emit_new_order(uuid)','857ea2957413757004f48cd06aef6636','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_emit_new_order_row()','67985321f147eb6fbbf2619c9e5379b5','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_on_orders()','6fc5ea02b13e5c4e8009ba4e545a38c6','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_on_timeline()','a1b0a5164d45a62929c422d5fe416a9c','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_request_dispatch()','9f66b06e0c062af551a80bf12927ae04','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_notification_vault_secret(text)','5efc6123d3e303f8f92674406318374e','postgres',true,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('staff_profiles_enforce_master_owner()','ffa4b5352ede39fa3e91606ae502253c','postgres',false,ARRAY['search_path=public']::text[],'{postgres=X/postgres,service_role=X/postgres}');
INSERT INTO public.production_function_manifest VALUES ('trg_release_catalogue_voucher_on_order_cancel()','35a3b34bbf7e79fe1167c54bce6da33f','postgres',true,ARRAY['search_path=public']::text[],'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}');

CREATE TRIGGER extra_stock_block_assignment_after_production_start BEFORE UPDATE OF order_id ON extra_stock FOR EACH ROW EXECUTE FUNCTION _prevent_fresh_pick_assignment_after_production_start();
CREATE TRIGGER extra_stock_event_on_row AFTER INSERT OR UPDATE OF lifecycle ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_row();
CREATE CONSTRAINT TRIGGER extra_stock_fresh_pick_ready_state_readiness AFTER UPDATE OF ready_for_collection ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_stock_ready_change();
CREATE TRIGGER extra_stock_guard_disposition BEFORE UPDATE OF sold_at, cut_into_slices_at ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_disposition();
CREATE TRIGGER extra_stock_guard_walk_in_hold BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_walk_in_hold();
CREATE CONSTRAINT TRIGGER extra_stock_order_readiness_sync AFTER UPDATE OF order_id ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _sync_order_readiness_after_stock_link();
CREATE TRIGGER extra_stock_set_updated_at BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER library_cake_sizes_set_updated_at BEFORE UPDATE ON library_cake_sizes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER library_cakes_set_updated_at BEFORE UPDATE ON library_cakes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE CONSTRAINT TRIGGER order_adjustments_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON order_adjustments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan();
CREATE CONSTRAINT TRIGGER order_delivery_details_invariant_aiud AFTER INSERT OR DELETE OR UPDATE ON order_delivery_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_delivery_details_invariant();
CREATE TRIGGER order_delivery_details_set_updated_at BEFORE UPDATE ON order_delivery_details FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE CONSTRAINT TRIGGER order_dine_in_reservations_assert_invariant AFTER INSERT OR DELETE OR UPDATE ON order_dine_in_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_dine_in_reservation_invariant();
CREATE TRIGGER order_dine_in_reservations_set_updated_at BEFORE UPDATE ON order_dine_in_reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER order_items_preorder_size_availability BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability();
CREATE TRIGGER order_items_preorder_size_availability_update BEFORE UPDATE OF order_id, cake_id, cake_size_id ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability();
CREATE CONSTRAINT TRIGGER order_items_readiness_reconcile AFTER INSERT OR DELETE OR UPDATE OF order_id, cake_id, cake_size_id, quantity ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_order_readiness_after_item_row_change();
CREATE CONSTRAINT TRIGGER order_items_stock_linkage_final AFTER INSERT OR UPDATE ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final();
CREATE TRIGGER staff_notification_on_timeline_insert AFTER INSERT ON order_timeline_events FOR EACH ROW EXECUTE FUNCTION staff_notification_on_timeline();
CREATE TRIGGER extra_stock_event_on_order_link AFTER INSERT OR UPDATE OF extra_stock_id ON orders FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_order_link();
CREATE TRIGGER fresh_pick_customer_name_guard BEFORE INSERT ON orders FOR EACH ROW WHEN (new.customer_id IS NULL AND new.order_source = 'customer_website'::text AND new.extra_stock_id IS NOT NULL) EXECUTE FUNCTION _guard_fresh_pick_customer_name();
CREATE TRIGGER fresh_pick_order_readiness_and_handoff_guard BEFORE UPDATE OF ready_at, picked_up_at, out_for_delivery_at, delivered_at ON orders FOR EACH ROW EXECUTE FUNCTION _guard_fresh_pick_order_readiness_and_handoff();
CREATE CONSTRAINT TRIGGER orders_assert_dine_in_reservation_invariant AFTER INSERT OR UPDATE OF fulfilment_method ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_dine_in_reservation_invariant();
CREATE CONSTRAINT TRIGGER orders_delivery_details_invariant_au AFTER INSERT OR UPDATE OF fulfilment_method ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_delivery_details_invariant();
CREATE CONSTRAINT TRIGGER orders_fresh_pick_settlement_readiness AFTER UPDATE OF status, payment_status ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_payment_change();
CREATE TRIGGER orders_prevent_direct_payment_mutation BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_direct_order_payment_mutation();
CREATE TRIGGER orders_release_catalogue_voucher_on_cancel AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = 'cancelled'::order_status AND old.status IS DISTINCT FROM 'cancelled'::order_status) EXECUTE FUNCTION trg_release_catalogue_voucher_on_order_cancel();
CREATE TRIGGER orders_release_fresh_pick_on_cancel AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = 'cancelled'::order_status AND old.status IS DISTINCT FROM 'cancelled'::order_status AND new.order_source = 'customer_website'::text AND new.extra_stock_id IS NOT NULL) EXECUTE FUNCTION _release_fresh_pick_after_guest_cancel();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE CONSTRAINT TRIGGER orders_size_availability_final AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final();
CREATE TRIGGER staff_notification_on_orders_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION staff_notification_on_orders();
CREATE CONSTRAINT TRIGGER staff_notification_on_orders_insert_new_order AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_notification_emit_new_order_row();
CREATE TRIGGER staff_notification_on_orders_update AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION staff_notification_on_orders();
CREATE CONSTRAINT TRIGGER payment_allocations_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan();
CREATE TRIGGER payment_corrections_immutable BEFORE DELETE OR UPDATE ON payment_corrections FOR EACH ROW EXECUTE FUNCTION prevent_payment_correction_mutation();
CREATE CONSTRAINT TRIGGER payments_fresh_pick_settlement_readiness AFTER UPDATE OF status ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_payment_row_change();
CREATE TRIGGER refunds_assert_within_overpayment BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION assert_refund_within_overpayment();
CREATE CONSTRAINT TRIGGER refunds_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan();
CREATE TRIGGER staff_notification_event_created_at_immutable BEFORE UPDATE OF created_at ON staff_notification_events FOR EACH ROW EXECUTE FUNCTION reject_staff_notification_event_created_at_update();
CREATE TRIGGER staff_notification_request_dispatch AFTER INSERT ON staff_notification_events FOR EACH ROW EXECUTE FUNCTION staff_notification_request_dispatch();
CREATE TRIGGER staff_profiles_enforce_master_owner BEFORE INSERT OR UPDATE OF is_master_owner, is_active, role_id ON staff_profiles FOR EACH ROW EXECUTE FUNCTION staff_profiles_enforce_master_owner();
CREATE TRIGGER staff_profiles_set_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.production_trigger_manifest(table_name text NOT NULL, trigger_name text NOT NULL, definition text NOT NULL, PRIMARY KEY(table_name,trigger_name));
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_block_assignment_after_production_start','CREATE TRIGGER extra_stock_block_assignment_after_production_start BEFORE UPDATE OF order_id ON extra_stock FOR EACH ROW EXECUTE FUNCTION _prevent_fresh_pick_assignment_after_production_start()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_event_on_row','CREATE TRIGGER extra_stock_event_on_row AFTER INSERT OR UPDATE OF lifecycle ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_row()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_fresh_pick_ready_state_readiness','CREATE CONSTRAINT TRIGGER extra_stock_fresh_pick_ready_state_readiness AFTER UPDATE OF ready_for_collection ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_stock_ready_change()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_guard_disposition','CREATE TRIGGER extra_stock_guard_disposition BEFORE UPDATE OF sold_at, cut_into_slices_at ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_disposition()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_guard_walk_in_hold','CREATE TRIGGER extra_stock_guard_walk_in_hold BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_walk_in_hold()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_order_readiness_sync','CREATE CONSTRAINT TRIGGER extra_stock_order_readiness_sync AFTER UPDATE OF order_id ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _sync_order_readiness_after_stock_link()');
INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_set_updated_at','CREATE TRIGGER extra_stock_set_updated_at BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('library_cake_sizes','library_cake_sizes_set_updated_at','CREATE TRIGGER library_cake_sizes_set_updated_at BEFORE UPDATE ON library_cake_sizes FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('library_cakes','library_cakes_set_updated_at','CREATE TRIGGER library_cakes_set_updated_at BEFORE UPDATE ON library_cakes FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('order_adjustments','order_adjustments_fresh_pick_settlement_readiness','CREATE CONSTRAINT TRIGGER order_adjustments_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON order_adjustments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan()');
INSERT INTO public.production_trigger_manifest VALUES ('order_delivery_details','order_delivery_details_invariant_aiud','CREATE CONSTRAINT TRIGGER order_delivery_details_invariant_aiud AFTER INSERT OR DELETE OR UPDATE ON order_delivery_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_delivery_details_invariant()');
INSERT INTO public.production_trigger_manifest VALUES ('order_delivery_details','order_delivery_details_set_updated_at','CREATE TRIGGER order_delivery_details_set_updated_at BEFORE UPDATE ON order_delivery_details FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('order_dine_in_reservations','order_dine_in_reservations_assert_invariant','CREATE CONSTRAINT TRIGGER order_dine_in_reservations_assert_invariant AFTER INSERT OR DELETE OR UPDATE ON order_dine_in_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_dine_in_reservation_invariant()');
INSERT INTO public.production_trigger_manifest VALUES ('order_dine_in_reservations','order_dine_in_reservations_set_updated_at','CREATE TRIGGER order_dine_in_reservations_set_updated_at BEFORE UPDATE ON order_dine_in_reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_preorder_size_availability','CREATE TRIGGER order_items_preorder_size_availability BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability()');
INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_preorder_size_availability_update','CREATE TRIGGER order_items_preorder_size_availability_update BEFORE UPDATE OF order_id, cake_id, cake_size_id ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability()');
INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_readiness_reconcile','CREATE CONSTRAINT TRIGGER order_items_readiness_reconcile AFTER INSERT OR DELETE OR UPDATE OF order_id, cake_id, cake_size_id, quantity ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_order_readiness_after_item_row_change()');
INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_stock_linkage_final','CREATE CONSTRAINT TRIGGER order_items_stock_linkage_final AFTER INSERT OR UPDATE ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final()');
INSERT INTO public.production_trigger_manifest VALUES ('order_timeline_events','staff_notification_on_timeline_insert','CREATE TRIGGER staff_notification_on_timeline_insert AFTER INSERT ON order_timeline_events FOR EACH ROW EXECUTE FUNCTION staff_notification_on_timeline()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','extra_stock_event_on_order_link','CREATE TRIGGER extra_stock_event_on_order_link AFTER INSERT OR UPDATE OF extra_stock_id ON orders FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_order_link()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','fresh_pick_customer_name_guard','CREATE TRIGGER fresh_pick_customer_name_guard BEFORE INSERT ON orders FOR EACH ROW WHEN (new.customer_id IS NULL AND new.order_source = ''customer_website''::text AND new.extra_stock_id IS NOT NULL) EXECUTE FUNCTION _guard_fresh_pick_customer_name()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','fresh_pick_order_readiness_and_handoff_guard','CREATE TRIGGER fresh_pick_order_readiness_and_handoff_guard BEFORE UPDATE OF ready_at, picked_up_at, out_for_delivery_at, delivered_at ON orders FOR EACH ROW EXECUTE FUNCTION _guard_fresh_pick_order_readiness_and_handoff()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_assert_dine_in_reservation_invariant','CREATE CONSTRAINT TRIGGER orders_assert_dine_in_reservation_invariant AFTER INSERT OR UPDATE OF fulfilment_method ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_dine_in_reservation_invariant()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_delivery_details_invariant_au','CREATE CONSTRAINT TRIGGER orders_delivery_details_invariant_au AFTER INSERT OR UPDATE OF fulfilment_method ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_order_delivery_details_invariant()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_fresh_pick_settlement_readiness','CREATE CONSTRAINT TRIGGER orders_fresh_pick_settlement_readiness AFTER UPDATE OF status, payment_status ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_payment_change()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_prevent_direct_payment_mutation','CREATE TRIGGER orders_prevent_direct_payment_mutation BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_direct_order_payment_mutation()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_release_catalogue_voucher_on_cancel','CREATE TRIGGER orders_release_catalogue_voucher_on_cancel AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = ''cancelled''::order_status AND old.status IS DISTINCT FROM ''cancelled''::order_status) EXECUTE FUNCTION trg_release_catalogue_voucher_on_order_cancel()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_release_fresh_pick_on_cancel','CREATE TRIGGER orders_release_fresh_pick_on_cancel AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (new.status = ''cancelled''::order_status AND old.status IS DISTINCT FROM ''cancelled''::order_status AND new.order_source = ''customer_website''::text AND new.extra_stock_id IS NOT NULL) EXECUTE FUNCTION _release_fresh_pick_after_guest_cancel()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_set_updated_at','CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','orders_size_availability_final','CREATE CONSTRAINT TRIGGER orders_size_availability_final AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','staff_notification_on_orders_insert','CREATE TRIGGER staff_notification_on_orders_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION staff_notification_on_orders()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','staff_notification_on_orders_insert_new_order','CREATE CONSTRAINT TRIGGER staff_notification_on_orders_insert_new_order AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_notification_emit_new_order_row()');
INSERT INTO public.production_trigger_manifest VALUES ('orders','staff_notification_on_orders_update','CREATE TRIGGER staff_notification_on_orders_update AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION staff_notification_on_orders()');
INSERT INTO public.production_trigger_manifest VALUES ('payment_allocations','payment_allocations_fresh_pick_settlement_readiness','CREATE CONSTRAINT TRIGGER payment_allocations_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan()');
INSERT INTO public.production_trigger_manifest VALUES ('payment_corrections','payment_corrections_immutable','CREATE TRIGGER payment_corrections_immutable BEFORE DELETE OR UPDATE ON payment_corrections FOR EACH ROW EXECUTE FUNCTION prevent_payment_correction_mutation()');
INSERT INTO public.production_trigger_manifest VALUES ('payments','payments_fresh_pick_settlement_readiness','CREATE CONSTRAINT TRIGGER payments_fresh_pick_settlement_readiness AFTER UPDATE OF status ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_payment_row_change()');
INSERT INTO public.production_trigger_manifest VALUES ('refunds','refunds_assert_within_overpayment','CREATE TRIGGER refunds_assert_within_overpayment BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION assert_refund_within_overpayment()');
INSERT INTO public.production_trigger_manifest VALUES ('refunds','refunds_fresh_pick_settlement_readiness','CREATE CONSTRAINT TRIGGER refunds_fresh_pick_settlement_readiness AFTER INSERT OR DELETE OR UPDATE ON refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_order_linked_finance_chan()');
INSERT INTO public.production_trigger_manifest VALUES ('staff_notification_events','staff_notification_event_created_at_immutable','CREATE TRIGGER staff_notification_event_created_at_immutable BEFORE UPDATE OF created_at ON staff_notification_events FOR EACH ROW EXECUTE FUNCTION reject_staff_notification_event_created_at_update()');
INSERT INTO public.production_trigger_manifest VALUES ('staff_notification_events','staff_notification_request_dispatch','CREATE TRIGGER staff_notification_request_dispatch AFTER INSERT ON staff_notification_events FOR EACH ROW EXECUTE FUNCTION staff_notification_request_dispatch()');
INSERT INTO public.production_trigger_manifest VALUES ('staff_profiles','staff_profiles_enforce_master_owner','CREATE TRIGGER staff_profiles_enforce_master_owner BEFORE INSERT OR UPDATE OF is_master_owner, is_active, role_id ON staff_profiles FOR EACH ROW EXECUTE FUNCTION staff_profiles_enforce_master_owner()');
INSERT INTO public.production_trigger_manifest VALUES ('staff_profiles','staff_profiles_set_updated_at','CREATE TRIGGER staff_profiles_set_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()');


























CREATE SCHEMA supabase_migrations;

CREATE TABLE supabase_migrations.schema_migrations (version text NOT NULL, name text, statements text[], created_at timestamptz DEFAULT now() NOT NULL, created_by text, idempotency_key text, rollback text[]);
ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);



INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260802120000','20260802120000_staff_profiles_and_roles');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260802140000','20260802140000_customers_and_addresses');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260803100000','20260803100000_customer_ops_polish');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260803120000','20260803120000_orders_foundation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260803133000','20260803133000_orders_drive_through');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806090000','20260806090000_master_library_foundation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806095000','20260806095000_library_cakes_sharing_guide');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806100000','library_cakes_price_drop_story');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806110000','library_cake_size_pricing');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806140000','milestone1_first_order');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260806150000','milestone1_architecture_unify');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807120000','orders_realtime_publication');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807140000','milestone2_customer_confirmation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807150000','fix_submit_guest_preorder_ambiguity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807160000','fix_order_items_delete_and_sync');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807180000','milestone3_payment_foundation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807200000','milestone3_discounts_adjustments');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807210000','milestone3_discount_lifecycle');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807220000','optional_guest_email_and_receipt_preference');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807230000','guest_order_edit_through_payment_lifecycle');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260807240000','discount_mutable_after_payment');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260808090000','preview3a1_operational_foundation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260808093000','preview3a2_staff_guest_preorder');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260808100000','preview3a3_calendar_item_sync_realtime');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260810090000','m4_p1_paid_order_addons');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260810093000','m4_p1_revoke_internal_paid_addon_sync');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260810110000','m4_p1_paid_addon_per_card_messages');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260810120000','m4_p2_fulfilment_delivery_details');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260810123000','m4_p2_revoke_anon_fulfilment_sync');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260811160000','m4_p3_delivery_finance_authority');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260811170000','m4_p3_delivery_fee_waiver_restore');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260811200000','m4_p3_independent_fee_requests');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260812080000','m4_p3_manager_delivery_charges_authority');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260812140000','m4_p5_delivery_operational_lifecycle');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260812213000','m5_p2_start_production');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260813120000','m5_p3_bakery_ready_authority');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260813140000','collection_picked_up_authority');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260813160000','extra_activation_v1');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260813170000','extra_reject_hardening');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260814140000','collection_customer_operations_picked_up');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260814150000','operations_approval_requests');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260814160000','rm10_valid_path_customer_operations');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260814170000','late_order_edit_paid_addons');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260815120000','manager_cross_month_approval_request');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260815220000','harden_guest_preorder');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260816160000','catalogue_purpose');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260816170000','catalogue_special_dates');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260816180000','catalogue_website_override');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260816190000','order_availability');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260816200000','storefront_collection_for_pickup_date');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260817120000','extra_fresh_picks_confirm_window');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260817140000','extra_pickup_from_order_cutoff');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260817150000','extra_order_cutoff_plus_one_day');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818120000','guest_preorder_options');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818130000','fix_guest_preorder_addon_ambiguity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818140000','guest_preorder_include_receipt');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818150000','guest_extra_include_receipt_complimentary');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818160000','catalogue_display_order');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818170000','catalogue_show_in_past_menu');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818200000','fulfilment_method_dine_in');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260818210000','whole_cake_customer_fulfilment');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260819100000','dine_in_reservation_venue');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260819120000','operating_hours');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260819140000','dine_in_reservation_serving_window');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260821130000','collection_bakery_picked_up');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260822100000','staff_notification_preferences');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260823150000','fix_dine_in_reservation_invariant_permissions');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260823160000','unify_staff_notification_preferences');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260824130000','rework_staff_notification_categories');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260825150000','staff_notification_realtime_sources');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260825161000','staff_notification_orders_replica_identity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260826150000','flexible_catalogue_complimentary_items');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260827100000','storefront_complimentary_customer_selectable');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260902120000','phase2_ordering_foundation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260902230000','phase3_preorder_date_engine');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903100000','set_production_capacity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903120000','waiting_list_engine');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903140000','phase8_guest_order_cancel');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903160000','staff_notification_reliability');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903180000','library_cake_photo_media');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260903220000','staff_notification_email_dispatch_queue');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260904120000','staff_notification_pg_cron_sweep');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260904190000','staff_notification_dispatch_vault');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260904200000','library_cake_photo_bakery_storage');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260904213000','fix_submit_guest_preorder_item_ambiguity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260904220000','fix_staff_notification_order_cake_name');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260905010000','staff_notification_new_order_content');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260905120000','library_cake_categories');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260907120000','library_cakes_popular_cakes');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260908120000','collection_cakes_homepage_preview');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260908153000','customer_cake_categories');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260908170000','assign_remaining_customer_cake_categories');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260909120000','extra_whole_cake_disposition');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260909140000','guest_extra_cart_multi_claim');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260910120000','post_payment_customer_change_guard');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260910200000','preorder_lead_time_exception_wiring');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260911090000','library_cake_tags');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260911120000','staff_master_owner');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260912100000','staff_must_change_password');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260912120000','staff_profiles_archived_at');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260915120000','library_cakes_browse_live_discovery');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260916120000','fresh_picks_fulfilment_preparation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260917120000','staff_guest_preorder_dine_in');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260917140000','extra_walk_in_hold');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260919120000','extra_stock_public_select_held_visible');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920120000','staff_notification_waiting_list_new_request');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920140000','guest_waiting_list_closed_date');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920160000','guest_waiting_list_multi_item');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920180000','waiting_list_confirmation_links');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920190000','waiting_list_confirmation_submit');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920200000','waiting_list_confirmation_staff_review');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920210000','waiting_list_confirmation_closed_date');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260920220000','waiting_list_confirmation_convert');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260921100000','waiting_list_confirmation_conversion_state');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260921120000','skip_noop_production_capacity_events');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260921150000','dine_in_party_composition');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260922120000','library_cake_size_prices');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260922140000','guest_preorder_price_ack');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260922180000','guest_preorder_delivery_processing_ack');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923080000','guest_extra_delivery_processing_ack');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923120000','storefront_faq_items');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923140000','payment_correction_refunds');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923160000','library_asset_image_upload');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923170000','dine_in_venue_library_assets');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923180000','staff_credential_events');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260923200000','rpc_actor_binding_and_payment_write_lock');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924120000','record_overpayment_refund_atomic');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924150000','rm10_physical_voucher_library');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924160000','rm10_voucher_number_numeric_identity');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924170000','20260924170000_preserve_library_rm10_expiry');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924180000','20260924180000_authoritative_library_rm10_expiry');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260924190000','20260924190000_catalogue_voucher_engine');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260925100000','20260925100000_catalogue_voucher_order_type');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260925120000','20260925120000_submit_guest_preorder_with_catalogue_voucher');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260926120000','20260926120000_catalogue_voucher_redemption_controls');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260926140000','20260926140000_restore_cancel_guest_order_override');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20260929160000','complete_extra_stock_walk_in_sale');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261001002046','fresh_pick_pricing_cancellation_release');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261001093506','walk_in_sale_physical_rm10_voucher');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261005124341','payment_correction_v1');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261005124422','fix_payment_correction_payment_status_enum');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261006095525','fresh_pick_ready_for_collection_override');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261007142243','owner_cancel_refund_fresh_pick');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261007142453','staff_notification_fresh_pick_hold_stale_suppression');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261007142738','restore_actor_bound_post_payment_customer_change');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261007225926','20261007150000_staff_notification_activation_boundary');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261010082912','cake_size_pickup_date_availability');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261010103300','cake_size_availability_trigger_acl_hardening');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261010104124','cake_size_order_amendment_safety');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261011100225','staff_creation_rpc_actor_authorization');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261012044754','waiting_list_accepted_quantity_metadata_compat');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018145717','assignment_fix');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018145759','cut_extra_stock_actor_acl');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018145831','cutoff');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018145858','refund_v1');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018145945','email_pause');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261018150013','refund_total_rpc_acl');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261019094554','20261019094554_fresh_pick_order_collection_readiness');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261019122055','20261019122055_fresh_pick_readiness_requires_full_settlement');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261019124500','20261019124500_allow_assigned_fresh_pick_stock_readiness');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261020002044','20261020002044_fresh_pick_preserve_explicit_ready_undo');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261020075703','customer_message_templates_v1');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261020134205','customer_message_counter_instructions');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261021055655','harden_extra_stock_order_assignment_eligibility');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261021065118','20261021063821_fresh_pick_bakery_allocation_aware_production_guard');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261021072429','restrict_start_production_execute');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261023062001','bakery_assigned_fresh_pick_readiness_compatibility');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261023135457','collection_fresh_pick_readiness_gate');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261023140034','enforce_pickup_handoff_gate_all_callers');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261023140052','enforce_shared_pickup_gate_mixed_allocation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261029131731','staff_order_source_amendment');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261030072645','fresh_pick_delivery_guarded_ready');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261030152116','fresh_pick_auto_readiness_all_fulfilments');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261031045711','fresh_pick_customer_name_validation');

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261031074456','allow_bakery_assignment_after_fresh_pick_customer_cutoff');

-- Relevant Production non-constraint indexes captured read-only.
CREATE UNIQUE INDEX catalogue_voucher_redemptions_one_active_per_order ON public.catalogue_voucher_redemptions USING btree (order_id) WHERE (status = 'redeemed'::text);
CREATE INDEX catalogue_voucher_redemptions_order_idx ON public.catalogue_voucher_redemptions USING btree (order_id);
CREATE INDEX catalogue_voucher_redemptions_voucher_status_idx ON public.catalogue_voucher_redemptions USING btree (voucher_id, status, redeemed_at DESC);
CREATE INDEX library_cake_sizes_cake_id_idx ON public.library_cake_sizes USING btree (cake_id);
CREATE INDEX library_cake_sizes_preorder_days_idx ON public.library_cake_sizes USING btree (preorder_days);
CREATE INDEX library_cakes_category_id_idx ON public.library_cakes USING btree (category_id);
CREATE INDEX library_cakes_name_idx ON public.library_cakes USING btree (name);
CREATE INDEX library_cakes_popular_cakes_idx ON public.library_cakes USING btree (popular_cakes_sort_order, name) WHERE (show_in_popular_cakes = true);
CREATE INDEX library_cakes_status_idx ON public.library_cakes USING btree (status);
CREATE UNIQUE INDEX order_adjustments_order_active_code_unique ON public.order_adjustments USING btree (order_id, code) WHERE ((code IS NOT NULL) AND (status = 'active'::text) AND (reverses_adjustment_id IS NULL));
CREATE INDEX order_adjustments_order_idx ON public.order_adjustments USING btree (order_id, created_at);
CREATE INDEX order_paid_addons_order_sort_idx ON public.order_paid_addons USING btree (order_id, sort_order);
CREATE INDEX order_paid_addons_type_idx ON public.order_paid_addons USING btree (paid_addon_type_id);
CREATE INDEX payment_allocations_order_idx ON public.payment_allocations USING btree (order_id);
CREATE INDEX payment_allocations_payment_idx ON public.payment_allocations USING btree (payment_id);
CREATE INDEX payment_corrections_actor_created_idx ON public.payment_corrections USING btree (corrected_by, corrected_at DESC);
CREATE INDEX payment_corrections_order_created_idx ON public.payment_corrections USING btree (order_id, corrected_at DESC);
CREATE INDEX payments_paid_at_idx ON public.payments USING btree (paid_at DESC);
CREATE INDEX payments_verified_by_idx ON public.payments USING btree (verified_by);
CREATE INDEX refunds_order_idx ON public.refunds USING btree (order_id);
CREATE UNIQUE INDEX refunds_request_key_uidx ON public.refunds USING btree (request_key) WHERE (request_key IS NOT NULL);
CREATE INDEX staff_notification_events_code_idx ON public.staff_notification_events USING btree (code);
CREATE INDEX staff_notification_events_created_at_idx ON public.staff_notification_events USING btree (created_at DESC);







CREATE TABLE public.release_gate_function_snapshot AS SELECT p.oid::regprocedure::text AS identity, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig AS config, p.proacl::text AS acl FROM pg_proc p WHERE p.oid IN ('public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure,'public.cut_extra_stock_into_slices(uuid,uuid)'::regprocedure);

CREATE TABLE public.release_gate_ledger_snapshot AS SELECT version,name FROM supabase_migrations.schema_migrations;
