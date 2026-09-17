/**
 * Live: CRM-assisted snapshot + create_staff_guest_preorder produces an
 * operational guest order (customer_id null, order_items snapshots).
 * Run: npx tsx scripts/test-customer-operations-manual-order-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guestSnapshotFromCrmCustomer } from "@/workspaces/customer-operations/orders/guest-snapshot";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.log(
    "SKIP live CO assisted-order verification (missing Supabase env).",
  );
  process.exit(0);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function check(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`FAIL  ${label}`);
  }
  console.log(`PASS  ${label}`);
}

async function main() {
  const cleanupOrderIds: string[] = [];
  let cleanupCustomerId: string | null = null;

  try {
    const { data: staff, error: staffErr } = await admin
      .from("staff_profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (staffErr || !staff?.id) throw new Error("No staff_profiles");

    const { data: sizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, price, label")
      .limit(40);
    let size:
      | {
          id: string;
          cake_id: string;
          price: number | string;
          label: string | null;
        }
      | undefined;
    let cakeName = "";
    for (const candidate of sizes ?? []) {
      const { data: cake } = await admin
        .from("library_cakes")
        .select("id, name")
        .eq("id", candidate.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (cake) {
        size = candidate;
        cakeName = String(cake.name);
        break;
      }
    }
    if (!size) throw new Error("No offerable Library cake size");

    const { data: customer, error: customerErr } = await admin
      .from("customers")
      .insert({
        full_name: "Jane CO Assisted",
        phone_number: `018${Date.now().toString().slice(-8)}`,
        phone_normalized: null,
      })
      .select("id, full_name, phone_number")
      .single();
    if (customerErr || !customer) {
      throw new Error(customerErr?.message ?? "Unable to create CRM customer");
    }
    cleanupCustomerId = customer.id;

    const snapshot = guestSnapshotFromCrmCustomer({
      fullName: customer.full_name,
      phoneNumber: customer.phone_number,
    });
    check(snapshot.guestName === "Jane CO Assisted", "B. CRM name → guest_name");
    check(snapshot.guestPhone === customer.phone_number, "C. CRM phone → guest_phone");

    const { data: order, error } = await admin.rpc(
      "create_staff_guest_preorder",
      {
        p_actor_staff_id: staff.id,
        p_customer_name: snapshot.guestName,
        p_phone: snapshot.guestPhone,
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: "2026-09-20",
        p_pickup_time: "14:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: size.cake_id,
            cake_size_id: size.id,
            quantity: 1,
          },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: "Birthday message",
        p_internal_notes: "CO assisted Phase 1 live",
        p_paid_addons: [],
        p_fulfilment_method: "pickup",
        p_delivery: null,
      },
    );
    if (error || !order?.id) {
      throw new Error(error?.message ?? "create_staff_guest_preorder failed");
    }
    cleanupOrderIds.push(order.id);

    const { data: row } = await admin
      .from("orders")
      .select(
        "id, customer_id, guest_name, guest_phone, order_source, status, payment_status, pickup_date, pickup_time, fulfilment_method, customer_notes",
      )
      .eq("id", order.id)
      .maybeSingle();

    check(row?.customer_id == null, "D. customer_id remains NULL");
    check(row?.guest_name === "Jane CO Assisted", "B. persisted guest_name");
    check(row?.guest_phone === snapshot.guestPhone, "C. persisted guest_phone");
    check(row?.order_source === "whatsapp", "M. staff/manual order source");
    check(row?.status === "submitted", "N. initial operational status");
    check(row?.payment_status === "unpaid", "O. unpaid payment state");
    check(row?.pickup_date === "2026-09-20", "P. pickup date");
    check(
      String(row?.pickup_time).startsWith("14:00"),
      "P. pickup time 14:00",
    );
    check(row?.fulfilment_method === "pickup", "P. pickup method");
    check(row?.customer_notes === "Birthday message", "notes persisted");

    const { data: items } = await admin
      .from("order_items")
      .select(
        "cake_id, cake_size_id, quantity, unit_price, cake_name, size_label",
      )
      .eq("order_id", order.id);

    check((items ?? []).length === 1, "I. order_items created");
    const item = items?.[0];
    check(item?.cake_id === size.cake_id, "F. library cake selected");
    check(item?.cake_size_id === size.id, "G. size selected");
    check(Number(item?.quantity) === 1, "H. quantity persisted");
    check(Number(item?.unit_price) === Number(size.price), "J. unit_price snapshot");
    check(item?.cake_name === cakeName, "K. cake-name snapshot");
    check(item?.size_label === size.label, "L. size-label snapshot");

    const { data: listed } = await admin
      .from("orders")
      .select("id")
      .is("customer_id", null)
      .in("status", [
        "submitted",
        "pending_confirmation",
        "awaiting_payment",
        "paid",
        "cancelled",
      ])
      .eq("id", order.id)
      .maybeSingle();
    check(Boolean(listed?.id), "Q. discoverable by operational guest query");

    const { data: workspaceRow } = await admin
      .from("orders")
      .select("id")
      .eq("id", order.id)
      .is("customer_id", null)
      .maybeSingle();
    check(Boolean(workspaceRow?.id), "R. openable as guest order workspace row");
  } finally {
    for (const id of cleanupOrderIds) {
      try {
        await admin.from("order_timeline_events").delete().eq("order_id", id);
        await admin.from("orders").delete().eq("id", id);
      } catch {
        /* ignore */
      }
    }
    if (cleanupCustomerId) {
      try {
        await admin.from("customers").delete().eq("id", cleanupCustomerId);
      } catch {
        /* ignore */
      }
    }
  }
}

main()
  .then(() => {
    console.log("PASS customer operations manual order live");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
