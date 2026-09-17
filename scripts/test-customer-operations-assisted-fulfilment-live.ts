/**
 * Live: CO assisted fulfilment methods persist operational guest orders.
 * Run: npx tsx scripts/test-customer-operations-assisted-fulfilment-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import { getDineInSlotsForDate } from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  earliestPickupDateYmd,
  getPickupSlotsForDate,
} from "@/engines/business-calendar/pickup-slots";
import { addBusinessCalendarDays } from "@/lib/dates";

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
    "SKIP live CO assisted fulfilment (missing Supabase env).",
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

function weekdayOf(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function nextWeekdayOnOrAfter(ymd: string, weekday: number): string {
  let current = ymd;
  for (let i = 0; i < 14; i += 1) {
    if (weekdayOf(current) === weekday) return current;
    current = addBusinessCalendarDays(current, 1) ?? current;
  }
  return ymd;
}

async function cleanupOrder(orderId: string) {
  await admin.from("order_timeline_events").delete().eq("order_id", orderId);
  await admin.from("order_dine_in_reservations").delete().eq("order_id", orderId);
  await admin.from("order_delivery_details").delete().eq("order_id", orderId);
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

async function main() {
  const cleanupOrderIds: string[] = [];
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
    for (const candidate of sizes ?? []) {
      const { data: cake } = await admin
        .from("library_cakes")
        .select("id, name")
        .eq("id", candidate.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (cake) {
        size = candidate;
        break;
      }
    }
    if (!size) throw new Error("No offerable Library cake size");

    const dateYmd = nextWeekdayOnOrAfter(earliestPickupDateYmd(), 4);
    const pickupTime =
      getPickupSlotsForDate(dateYmd, OPERATING_HOURS_SEED)[2]?.value ?? "15:00";
    const deliveryTime =
      getDeliverySlotsForDate(dateYmd, OPERATING_HOURS_SEED)[2]?.value ?? "12:00";
    const dineSlots = getDineInSlotsForDate(dateYmd, OPERATING_HOURS_SEED);
    const dineReservation = dineSlots[4]?.value ?? "14:00";
    const dineServing = dineReservation;
    const item = {
      cake_id: size.cake_id,
      cake_size_id: size.id,
      quantity: 1,
    };

    const pickup = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Pickup Parity",
      p_phone: "0111000001",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: pickupTime,
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO pickup parity live",
      p_paid_addons: [],
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    if (pickup.error || !pickup.data?.id) {
      throw new Error(pickup.error?.message ?? "pickup create failed");
    }
    cleanupOrderIds.push(pickup.data.id);
    check(pickup.data.customer_id == null, "pickup guest order (customer_id null)");
    check(pickup.data.fulfilment_method === "pickup", "pickup method persisted");
    check(String(pickup.data.pickup_date).startsWith(dateYmd), "pickup date persisted");

    const overridePickup = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Owner Override Pickup",
      p_phone: "0111000011",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: "14:15",
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO owner override pickup live",
      p_paid_addons: [],
      p_fulfilment_method: "pickup",
      p_delivery: null,
    });
    if (overridePickup.error || !overridePickup.data?.id) {
      throw new Error(
        overridePickup.error?.message ?? "owner override pickup create failed",
      );
    }
    cleanupOrderIds.push(overridePickup.data.id);
    check(
      String(overridePickup.data.pickup_time).startsWith("14:15"),
      "owner override pickup time persisted",
    );

    const overrideDelivery = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Owner Override Delivery",
      p_phone: "0111000012",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: "14:15",
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO owner override delivery live",
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: {
        recipient_name: "Override Recipient",
        recipient_phone: "0111000012",
        address_line_1: "2 Jalan Test",
        address_line_2: null,
        postcode: "88000",
        city: "Kota Kinabalu",
        state: "Sabah",
        recipient_notify_preference: "inform_recipient",
      },
    });
    if (overrideDelivery.error || !overrideDelivery.data?.id) {
      throw new Error(
        overrideDelivery.error?.message ?? "owner override delivery create failed",
      );
    }
    cleanupOrderIds.push(overrideDelivery.data.id);
    check(
      overrideDelivery.data.fulfilment_method === "delivery",
      "owner override delivery method persisted",
    );
    check(
      String(overrideDelivery.data.pickup_time).startsWith("14:15"),
      "owner override delivery time persisted",
    );

    const missingDelivery = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Owner Override Delivery Invalid",
      p_phone: "0111000014",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: "14:15",
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "should fail",
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: null,
    });
    if (missingDelivery.data?.id) cleanupOrderIds.push(missingDelivery.data.id);
    check(Boolean(missingDelivery.error), "owner override delivery still requires details");

    const beforeEarliest =
      addBusinessCalendarDays(earliestPickupDateYmd(), -1) ?? dateYmd;
    let thuBefore = beforeEarliest;
    for (let i = 0; i < 14; i += 1) {
      if (weekdayOf(thuBefore) === 4) break;
      thuBefore = addBusinessCalendarDays(thuBefore, -1) ?? thuBefore;
    }
    check(thuBefore < earliestPickupDateYmd(), "override dine-in date is before earliest");
    const overrideDineSlots = getDineInSlotsForDate(thuBefore, OPERATING_HOURS_SEED);
    const overrideReservation = overrideDineSlots[4]?.value ?? "14:00";
    const overrideDineIn = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Owner Override Dine-in",
      p_phone: "0111000013",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: thuBefore,
      p_pickup_time: overrideReservation,
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO owner override dine-in live",
      p_paid_addons: [],
      p_fulfilment_method: "dine_in",
      p_delivery: null,
      p_dine_in: {
        venue: "whitebird",
        guest_count: 2,
        reservation_time: overrideReservation,
        reservation_note: null,
      },
    });
    if (overrideDineIn.error || !overrideDineIn.data?.id) {
      throw new Error(
        overrideDineIn.error?.message ?? "owner override dine-in create failed",
      );
    }
    cleanupOrderIds.push(overrideDineIn.data.id);
    check(
      overrideDineIn.data.fulfilment_method === "dine_in",
      "owner override dine-in method persisted",
    );

    const delivery = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Delivery Parity",
      p_phone: "0111000002",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: deliveryTime,
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO delivery parity live",
      p_paid_addons: [],
      p_fulfilment_method: "delivery",
      p_delivery: {
        recipient_name: "Recipient",
        recipient_phone: "0111000002",
        address_line_1: "1 Jalan Test",
        address_line_2: null,
        postcode: "88000",
        city: "Kota Kinabalu",
        state: "Sabah",
        recipient_notify_preference: "inform_recipient",
      },
    });
    if (delivery.error || !delivery.data?.id) {
      throw new Error(delivery.error?.message ?? "delivery create failed");
    }
    cleanupOrderIds.push(delivery.data.id);
    check(delivery.data.fulfilment_method === "delivery", "delivery method persisted");
    const { data: deliveryRow } = await admin
      .from("order_delivery_details")
      .select("recipient_name, address_line_1, postcode, city, state")
      .eq("order_id", delivery.data.id)
      .maybeSingle();
    check(deliveryRow?.recipient_name === "Recipient", "delivery recipient persisted");
    check(deliveryRow?.address_line_1 === "1 Jalan Test", "delivery address persisted");
    check(deliveryRow?.city === "Kota Kinabalu", "delivery city persisted");

    const dineIn = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Dine-in Parity",
      p_phone: "0111000003",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: dineServing,
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "CO dine-in parity live",
      p_paid_addons: [],
      p_fulfilment_method: "dine_in",
      p_delivery: null,
      p_dine_in: {
        venue: "whitebird",
        guest_count: 2,
        reservation_time: dineReservation,
        reservation_note: "Window table",
      },
    });
    if (dineIn.error || !dineIn.data?.id) {
      throw new Error(dineIn.error?.message ?? "dine-in create failed");
    }
    cleanupOrderIds.push(dineIn.data.id);
    check(dineIn.data.fulfilment_method === "dine_in", "dine-in method persisted");
    const { data: reservation } = await admin
      .from("order_dine_in_reservations")
      .select("reservation_date, reservation_time, venue, guest_count, reservation_note")
      .eq("order_id", dineIn.data.id)
      .maybeSingle();
    check(Boolean(reservation), "dine-in reservation row persisted");
    check(
      String(reservation?.reservation_date).startsWith(dateYmd),
      "dine-in reservation date persisted",
    );
    check(
      String(reservation?.reservation_time).startsWith(dineReservation),
      "dine-in reservation time persisted",
    );
    check(reservation?.venue === "whitebird", "dine-in venue persisted");
    check(Number(reservation?.guest_count) === 2, "dine-in guest count persisted");

    const invalidDineIn = await admin.rpc("create_staff_guest_preorder", {
      p_actor_staff_id: staff.id,
      p_customer_name: "CO Dine-in Invalid",
      p_phone: "0111000004",
      p_email: null,
      p_order_source: "whatsapp",
      p_crew_order: false,
      p_pickup_date: dateYmd,
      p_pickup_time: dineServing,
      p_pickup_instruction: null,
      p_items: [item],
      p_complimentary: [],
      p_include_receipt: false,
      p_needs_bakery_attention: false,
      p_bakery_attention_note: null,
      p_customer_notes: null,
      p_internal_notes: "should fail",
      p_paid_addons: [],
      p_fulfilment_method: "dine_in",
      p_delivery: null,
      p_dine_in: {
        venue: "whitebird",
        guest_count: 2,
        reservation_time: "14:07",
        reservation_note: null,
      },
    });
    if (invalidDineIn.data?.id) cleanupOrderIds.push(invalidDineIn.data.id);
    check(Boolean(invalidDineIn.error), "invalid dine-in slot rejected");
  } finally {
    for (const id of cleanupOrderIds) {
      try {
        await cleanupOrder(id);
      } catch {
        /* ignore */
      }
    }
  }
}

main()
  .then(() => {
    console.log("PASS customer operations assisted fulfilment live");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
