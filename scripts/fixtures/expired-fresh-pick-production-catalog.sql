-- Sanitized schema-only reconstruction from read-only Production catalogs.

-- Captured from Supabase cuowwlduhxxifmpvpltt, PostgreSQL 17.6, 2026-10-31.

-- No customer, payment, stock, or staff rows are copied. Trigger bodies are metadata-only placeholders, disabled for this structural rehearsal.

CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;

CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon') $$;

CREATE TABLE public.customers(id uuid PRIMARY KEY); CREATE TABLE public.collections(id uuid PRIMARY KEY); CREATE TABLE public.library_cakes(id uuid PRIMARY KEY); CREATE TABLE public.library_cake_sizes(id uuid PRIMARY KEY);

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

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_cake_name_nonempty CHECK (length(TRIM(BOTH FROM cake_name)) > 0);

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES staff_profiles(id);

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_confirmed_requires_fields CHECK (lifecycle <> 'confirmed'::extra_stock_lifecycle OR prepared_on IS NOT NULL AND pickup_through_at IS NOT NULL AND pickup_available_from_at IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL);

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_cut_into_slices_by_fkey FOREIGN KEY (cut_into_slices_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_library_cake_id_fkey FOREIGN KEY (library_cake_id) REFERENCES library_cakes(id) ON DELETE SET NULL;

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_library_cake_size_id_fkey FOREIGN KEY (library_cake_size_id) REFERENCES library_cake_sizes(id) ON DELETE SET NULL;

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_pickup_from_order_cutoff_fields CHECK (pickup_available_from_at IS NULL OR pickup_through_at IS NOT NULL);

ALTER TABLE public.extra_stock ADD CONSTRAINT extra_stock_pkey PRIMARY KEY (id);

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

ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_pkey PRIMARY KEY (id);

ALTER TABLE public.extra_stock_events ADD CONSTRAINT extra_stock_events_type_not_blank CHECK (char_length(TRIM(BOTH FROM event_type)) > 0);

ALTER TABLE public.order_items ADD CONSTRAINT order_items_cake_id_fkey FOREIGN KEY (cake_id) REFERENCES library_cakes(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_cake_size_id_fkey FOREIGN KEY (cake_size_id) REFERENCES library_cake_sizes(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE public.order_items ADD CONSTRAINT order_items_unit_price_non_negative CHECK (unit_price >= 0::numeric);

ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_pkey PRIMARY KEY (id);

ALTER TABLE public.order_timeline_events ADD CONSTRAINT order_timeline_events_type_not_blank CHECK (char_length(TRIM(BOTH FROM event_type)) > 0);

ALTER TABLE public.orders ADD CONSTRAINT orders_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

ALTER TABLE public.orders ADD CONSTRAINT orders_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_extra_stock_id_fkey FOREIGN KEY (extra_stock_id) REFERENCES extra_stock(id) ON DELETE RESTRICT;

ALTER TABLE public.orders ADD CONSTRAINT orders_guest_or_customer CHECK (customer_id IS NOT NULL OR customer_id IS NULL AND guest_name IS NOT NULL AND char_length(TRIM(BOTH FROM guest_name)) > 0);

ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_format CHECK (order_number ~ '^ORD-[0-9]{8}-[0-9]{4}$'::text);

ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);

ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check CHECK (order_source = ANY (ARRAY['customer_website'::text, 'jotform'::text, 'whatsapp'::text, 'whitebird_instagram'::text, 'wee'::text, 'lex'::text, 'kin'::text, 'walk_in'::text, 'last_minute'::text, 'other'::text]));

ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_other_nonblank_check CHECK (order_source_other IS NULL OR char_length(btrim(order_source_other)) > 0);

ALTER TABLE public.orders ADD CONSTRAINT orders_out_for_delivery_by_fkey FOREIGN KEY (out_for_delivery_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_picked_up_by_fkey FOREIGN KEY (picked_up_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.orders ADD CONSTRAINT orders_post_payment_change_override_by_fkey FOREIGN KEY (post_payment_change_override_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_post_payment_customer_change_count_nonneg CHECK (post_payment_customer_change_count >= 0);

ALTER TABLE public.orders ADD CONSTRAINT orders_production_started_by_fkey FOREIGN KEY (production_started_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_ready_by_fkey FOREIGN KEY (ready_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_rm10_suppression_code_check CHECK (rm10_card_issuance_suppression_code IS NULL OR (rm10_card_issuance_suppression_code = ANY (ARRAY['august_promo_applied'::text, 'rm10_voucher_redeemed'::text])));

ALTER TABLE public.orders ADD CONSTRAINT orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.roles ADD CONSTRAINT roles_code_key UNIQUE (code);

ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_archived_inactive_chk CHECK (archived_at IS NULL OR is_active = false);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_username_format CHECK (username ~ '^[a-zA-Z0-9._-]{3,32}$'::citext);

ALTER TABLE public.staff_profiles ADD CONSTRAINT staff_profiles_username_key UNIQUE (username);

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

ALTER TABLE public.extra_stock ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.extra_stock_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_timeline_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

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

CREATE FUNCTION public._prevent_fresh_pick_assignment_after_production_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._extra_stock_event_on_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._reconcile_fresh_pick_readiness_after_stock_ready_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._extra_stock_guard_disposition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._extra_stock_guard_walk_in_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._sync_order_readiness_after_stock_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.enforce_preorder_size_availability() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._reconcile_order_readiness_after_item_row_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.enforce_order_size_availability_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._extra_stock_event_on_order_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._guard_fresh_pick_customer_name() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._guard_fresh_pick_order_readiness_and_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.assert_order_dine_in_reservation_invariant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.assert_order_delivery_details_invariant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._reconcile_fresh_pick_readiness_after_order_payment_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.prevent_direct_order_payment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.trg_release_catalogue_voucher_on_order_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public._release_fresh_pick_after_guest_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.staff_notification_on_orders() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE FUNCTION public.staff_notification_emit_new_order_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE TRIGGER extra_stock_block_assignment_after_production_start BEFORE UPDATE OF order_id ON extra_stock FOR EACH ROW EXECUTE FUNCTION _prevent_fresh_pick_assignment_after_production_start();

CREATE TRIGGER extra_stock_event_on_row AFTER INSERT OR UPDATE OF lifecycle ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_row();

CREATE CONSTRAINT TRIGGER extra_stock_fresh_pick_ready_state_readiness AFTER UPDATE OF ready_for_collection ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_stock_ready_change();

CREATE TRIGGER extra_stock_guard_disposition BEFORE UPDATE OF sold_at, cut_into_slices_at ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_disposition();

CREATE TRIGGER extra_stock_guard_walk_in_hold BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_walk_in_hold();

CREATE CONSTRAINT TRIGGER extra_stock_order_readiness_sync AFTER UPDATE OF order_id ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _sync_order_readiness_after_stock_link();

CREATE TRIGGER extra_stock_set_updated_at BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER order_items_preorder_size_availability BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability();

CREATE TRIGGER order_items_preorder_size_availability_update BEFORE UPDATE OF order_id, cake_id, cake_size_id ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability();

CREATE CONSTRAINT TRIGGER order_items_readiness_reconcile AFTER INSERT OR DELETE OR UPDATE OF order_id, cake_id, cake_size_id, quantity ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_order_readiness_after_item_row_change();

CREATE CONSTRAINT TRIGGER order_items_stock_linkage_final AFTER INSERT OR UPDATE ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final();

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

ALTER TABLE public.extra_stock DISABLE TRIGGER USER;

ALTER TABLE public.orders DISABLE TRIGGER USER;

ALTER TABLE public.order_items DISABLE TRIGGER USER;

CREATE TABLE public.production_trigger_manifest(table_name text NOT NULL, trigger_name text NOT NULL, definition text NOT NULL, PRIMARY KEY(table_name,trigger_name));

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_block_assignment_after_production_start','CREATE TRIGGER extra_stock_block_assignment_after_production_start BEFORE UPDATE OF order_id ON extra_stock FOR EACH ROW EXECUTE FUNCTION _prevent_fresh_pick_assignment_after_production_start()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_event_on_row','CREATE TRIGGER extra_stock_event_on_row AFTER INSERT OR UPDATE OF lifecycle ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_event_on_row()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_fresh_pick_ready_state_readiness','CREATE CONSTRAINT TRIGGER extra_stock_fresh_pick_ready_state_readiness AFTER UPDATE OF ready_for_collection ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_fresh_pick_readiness_after_stock_ready_change()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_guard_disposition','CREATE TRIGGER extra_stock_guard_disposition BEFORE UPDATE OF sold_at, cut_into_slices_at ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_disposition()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_guard_walk_in_hold','CREATE TRIGGER extra_stock_guard_walk_in_hold BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION _extra_stock_guard_walk_in_hold()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_order_readiness_sync','CREATE CONSTRAINT TRIGGER extra_stock_order_readiness_sync AFTER UPDATE OF order_id ON extra_stock DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _sync_order_readiness_after_stock_link()');

INSERT INTO public.production_trigger_manifest VALUES ('extra_stock','extra_stock_set_updated_at','CREATE TRIGGER extra_stock_set_updated_at BEFORE UPDATE ON extra_stock FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_preorder_size_availability','CREATE TRIGGER order_items_preorder_size_availability BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability()');

INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_preorder_size_availability_update','CREATE TRIGGER order_items_preorder_size_availability_update BEFORE UPDATE OF order_id, cake_id, cake_size_id ON order_items FOR EACH ROW EXECUTE FUNCTION enforce_preorder_size_availability()');

INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_readiness_reconcile','CREATE CONSTRAINT TRIGGER order_items_readiness_reconcile AFTER INSERT OR DELETE OR UPDATE OF order_id, cake_id, cake_size_id, quantity ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION _reconcile_order_readiness_after_item_row_change()');

INSERT INTO public.production_trigger_manifest VALUES ('order_items','order_items_stock_linkage_final','CREATE CONSTRAINT TRIGGER order_items_stock_linkage_final AFTER INSERT OR UPDATE ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_size_availability_final()');

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

CREATE FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) RETURNS public.extra_stock LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN NULL; END $$;

REVOKE ALL ON FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assign_extra_stock_to_order(uuid,uuid,uuid) TO authenticated, service_role;

CREATE FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) RETURNS public.extra_stock LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN NULL; END $$;

REVOKE ALL ON FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cut_extra_stock_into_slices(uuid,uuid) TO authenticated, service_role;

CREATE TABLE public.release_gate_function_snapshot AS SELECT p.oid::regprocedure::text AS identity, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig AS config, p.proacl::text AS acl FROM pg_proc p WHERE p.oid IN ('public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure,'public.cut_extra_stock_into_slices(uuid,uuid)'::regprocedure);

CREATE TABLE public.release_gate_ledger_snapshot AS SELECT version,name FROM supabase_migrations.schema_migrations;
