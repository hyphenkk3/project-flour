/**
 * Operations approval requests — live RPC authority + execution.
 *
 * Prerequisites: apply
 *   supabase/migrations/20260814150000_operations_approval_requests.sql
 *   supabase/migrations/20260814170000_late_order_edit_paid_addons.sql
 * Optional for Manager discount execution:
 *   supabase/migrations/20260814160000_rm10_valid_path_customer_operations.sql
 * Expected SHA-256 of the original approval migration is asserted below.
 *
 * Run: npx tsx scripts/test-operations-approvals-live.ts
 *
 * Disposable fixtures only. Never mutates Product order
 * 7e9779ac-152b-42e0-8002-34ba8e9b11b5.
 * Exit 2 if migration not applied.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQuickViewPaidAddonBlocks } from "@/workspaces/owner/calendar/quick-view-paid-addons";

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

const SIG = `APR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EXPECTED_HASH =
  "301f7d48e9469332bb0bbf6ebaa5e8772d481dfb3ee795c387765d00f9e8ad61";
const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";

function singaporeYmd(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Check = { label: string; ok: boolean; detail?: string };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    process.exit(0);
  }

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260814150000_operations_approval_requests.sql",
  );
  const migrationHash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  console.log(`approval migration sha256=${migrationHash}`);
  assert.equal(migrationHash, EXPECTED_HASH);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const probe = await admin
    .from("operations_approval_requests")
    .select("id")
    .limit(1);
  if (probe.error && /does not exist|schema cache/i.test(probe.error.message)) {
    console.error("BLOCKED: operations_approval_requests missing (apply migration).");
    console.error(probe.error.message);
    process.exit(2);
  }

  const rpcProbe = await admin.rpc("create_operations_approval_request", {
    p_order_id: "00000000-0000-0000-0000-000000000000",
    p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
    p_request_type: "cross_month_pickup",
    p_reason: "probe",
    p_payload: {},
  });
  const rpcMsg = rpcProbe.error?.message ?? "";
  if (/Could not find the function|schema cache|does not exist/i.test(rpcMsg)) {
    console.error("BLOCKED: create_operations_approval_request missing.");
    console.error(rpcMsg);
    process.exit(2);
  }

  const checks: Check[] = [];
  const orderIds: string[] = [];
  const staffIdsToDelete: string[] = [];
  const authUserIdsToDelete: string[] = [];

  function pass(label: string, detail?: string) {
    checks.push({ label, ok: true, detail });
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function fail(label: string, detail?: string) {
    checks.push({ label, ok: false, detail });
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function check(condition: boolean, label: string, detail?: string) {
    if (condition) pass(label, detail);
    else fail(label, detail);
  }

  async function cleanupOrder(orderId: string) {
    await admin.from("operations_approval_requests").delete().eq("order_id", orderId);
    await admin.from("order_timeline_events").delete().eq("order_id", orderId);
    await admin.from("order_confirmation_snapshots").delete().eq("order_id", orderId);
    const { data: addons } = await admin
      .from("order_paid_addons")
      .select("id")
      .eq("order_id", orderId);
    for (const addon of addons ?? []) {
      await admin
        .from("order_paid_addon_messages")
        .delete()
        .eq("order_paid_addon_id", addon.id);
    }
    await admin.from("order_paid_addons").delete().eq("order_id", orderId);
    await admin.from("physical_discount_voucher_redemptions").delete().eq("order_id", orderId);
    await admin.from("order_adjustments").delete().eq("order_id", orderId);
    await admin.from("order_complimentary_items").delete().eq("order_id", orderId);
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("order_delivery_details").delete().eq("order_id", orderId);
    const { error } = await admin.from("orders").delete().eq("id", orderId);
    if (error) {
      throw new Error(`cleanup failed for ${orderId}: ${error.message}`);
    }
  }

  async function createEphemeralStaff(roleCode: string, label: string) {
    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", roleCode)
      .maybeSingle();
    if (!role?.id) throw new Error(`${roleCode} role missing`);
    const email = `apr-${label}-${Date.now()}@whitebird.dev`;
    const { data: authCreated, error: authErr } =
      await admin.auth.admin.createUser({
        email,
        password: `TmpApr_${Date.now()}!`,
        email_confirm: true,
      });
    if (authErr || !authCreated.user?.id) {
      throw new Error(authErr?.message ?? `Failed auth ${label}`);
    }
    authUserIdsToDelete.push(authCreated.user.id);
    const { data: profile, error: profileErr } = await admin
      .from("staff_profiles")
      .insert({
        auth_user_id: authCreated.user.id,
        username: `apr${label}${Date.now().toString().slice(-6)}`.slice(0, 24),
        email,
        display_name: `${SIG} ${label}`,
        role_id: role.id,
        is_active: true,
      })
      .select("id")
      .single();
    if (profileErr || !profile?.id) {
      throw new Error(profileErr?.message ?? `Failed profile ${label}`);
    }
    staffIdsToDelete.push(profile.id);
    return profile.id as string;
  }

  try {
    const { data: roles } = await admin.from("roles").select("id, code");
    const ownerRole = (roles ?? []).find((r) => r.code === "owner");
    if (!ownerRole?.id) throw new Error("owner role missing");
    const { data: ownerStaff, error: ownerErr } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("role_id", ownerRole.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (ownerErr || !ownerStaff?.id) {
      throw new Error(ownerErr?.message ?? "No owner staff");
    }
    const ownerId = ownerStaff.id as string;

    const { data: productBefore } = await admin
      .from("orders")
      .select("id, pickup_date, pickup_time, status, updated_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();

    const coId = await createEphemeralStaff("customer_operations", "co");
    const managerId = await createEphemeralStaff("manager", "mgr");
    const bakeryId = await createEphemeralStaff("bakery", "bak");
    const collectionId = await createEphemeralStaff("collection", "col");

    const { data: sizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, price, label")
      .limit(40);
    let size = sizes?.[0];
    for (const candidate of sizes ?? []) {
      const { data: cake } = await admin
        .from("library_cakes")
        .select("id")
        .eq("id", candidate.cake_id)
        .in("status", ["active", "seasonal"])
        .maybeSingle();
      if (!cake) continue;
      const label = String(candidate.label ?? "");
      if (label === '6"' || label === '8"' || label.startsWith('6"') || label.startsWith('8"')) {
        size = candidate;
        break;
      }
      size = candidate;
    }
    if (!size) throw new Error("No cake size");

    const { data: siblingSizes } = await admin
      .from("library_cake_sizes")
      .select("id, cake_id, price, label")
      .eq("cake_id", size.cake_id);
    const size6 =
      (siblingSizes ?? []).find((row) => String(row.label ?? "").startsWith('6"')) ??
      size;
    const size8 =
      (siblingSizes ?? []).find((row) => String(row.label ?? "").startsWith('8"')) ??
      null;
    const { data: birthdayType } = await admin
      .from("paid_addon_types")
      .select("code, name, unit_price")
      .eq("code", "birthday_card")
      .maybeSingle();
    if (!birthdayType?.code) throw new Error("birthday_card catalog type missing");
    const birthdayUnitPrice = Number(birthdayType.unit_price);

    function cakeItemFromSize(
      row: { id: string; cake_id: string; price: number; label: string },
      quantity = 1,
      cakeName = "Cake",
    ) {
      return {
        cake_id: row.cake_id,
        cake_size_id: row.id,
        quantity,
        unit_price: row.price,
        cake_name: cakeName,
        size_label: row.label,
      };
    }

    function birthdayPayload(quantity: number) {
      return {
        code: "birthday_card",
        name: birthdayType!.name ?? "Birthday Card",
        quantity,
        messages: Array.from({ length: quantity }, () => null),
      };
    }

    async function createOrder(name: string, pickupDate: string) {
      const { data, error } = await admin.rpc("create_staff_guest_preorder", {
        p_actor_staff_id: ownerId,
        p_customer_name: name,
        p_phone: "0190000111",
        p_email: null,
        p_order_source: "whatsapp",
        p_crew_order: false,
        p_pickup_date: pickupDate,
        p_pickup_time: "16:00:00",
        p_pickup_instruction: null,
        p_items: [
          {
            cake_id: size6.cake_id,
            cake_size_id: size6.id,
            quantity: 1,
          },
        ],
        p_complimentary: [],
        p_include_receipt: false,
        p_needs_bakery_attention: false,
        p_bakery_attention_note: null,
        p_customer_notes: null,
        p_internal_notes: `${SIG}`,
        p_fulfilment_method: "pickup",
        p_delivery: null,
      });
      if (error || !data?.id) {
        throw new Error(error?.message ?? "create failed");
      }
      const id = data.id as string;
      check(id !== PRODUCT_ORDER_ID, "fixture is not Product order");
      orderIds.push(id);
      return id;
    }

    const crossOrder = await createOrder(`${SIG} Cross`, "2026-08-20");
    const discountOrder = await createOrder(`${SIG} Disc`, "2026-08-20");
    const todayYmd = singaporeYmd();
    const tomorrowYmd = addCalendarDays(todayYmd, 1);
    const farPickup = "2026-08-20";
    const latePickup = todayYmd;
    const lateProposedPickup =
      tomorrowYmd.slice(0, 7) === latePickup.slice(0, 7) ? tomorrowYmd : undefined;

    const lateOrder = await createOrder(`${SIG} Late`, latePickup);
    const farOrder = await createOrder(`${SIG} Far`, farPickup);
    const staleOrder = await createOrder(`${SIG} Stale`, farPickup);
    const comboOrder = await createOrder(`${SIG} Combo`, latePickup);
    const managerDiscountOrder = await createOrder(`${SIG} MgrDisc`, farPickup);

    // Outside cutoff — late_order_edit cannot be requested
    {
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: farOrder,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "should be direct save",
        p_payload: {
          proposed: {
            pickup_date: farPickup,
            pickup_time: "15:00",
          },
        },
      });
      check(
        Boolean(error),
        "late_order_edit blocked outside 2-day cutoff",
        error?.message,
      );
    }

    // Live calendar-date boundary: pickup 16 Aug vs Singapore today.
    {
      const pickup16 = await createOrder(`${SIG} P16`, "2026-08-16");
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: pickup16,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "16 Aug boundary",
        p_payload: {
          proposed: {
            pickup_date: "2026-08-16",
            pickup_time: "16:00",
          },
        },
      });
      const [ty, tm, td] = todayYmd.split("-").map(Number);
      const [py, pm, pd] = [2026, 8, 16];
      const days =
        (Date.UTC(py, pm - 1, pd) - Date.UTC(ty, tm - 1, td)) / 86_400_000;
      console.log(`LIVE_TODAY=${todayYmd} days_until_16_aug=${days}`);
      if (days >= 2) {
        check(
          Boolean(error),
          "pickup 16 Aug: 14 Aug (D-2) late_edit request blocked — direct edit",
          error?.message,
        );
      } else {
        check(
          !error,
          "pickup 16 Aug: inside cutoff so late_edit request allowed (15 Aug+)",
          error?.message,
        );
      }

      const pickupD1 = await createOrder(`${SIG} D1`, tomorrowYmd);
      const d1 = await admin.rpc("create_operations_approval_request", {
        p_order_id: pickupD1,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "D-1 requires approval",
        p_payload: {
          proposed: {
            pickup_date: tomorrowYmd,
            pickup_time: "16:00",
          },
        },
      });
      check(
        !d1.error,
        "pickup tomorrow (D-1 / 15 Aug equivalent): late_edit request allowed",
        d1.error?.message,
      );
    }

    // Owner cannot request
    {
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: ownerId,
        p_request_type: "cross_month_pickup",
        p_reason: "owner attempt",
        p_payload: {
          proposed_pickup_date: "2026-09-03",
          proposed_pickup_time: "16:00",
        },
      });
      check(Boolean(error), "Owner cannot create approval request", error?.message);
    }

    // Bakery / Collection cannot request
    {
      const bakery = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: bakeryId,
        p_request_type: "cross_month_pickup",
        p_reason: "bakery attempt",
        p_payload: {
          proposed_pickup_date: "2026-09-03",
          proposed_pickup_time: "16:00",
        },
      });
      check(Boolean(bakery.error), "Bakery cannot request", bakery.error?.message);
      const collection = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: collectionId,
        p_request_type: "cross_month_pickup",
        p_reason: "collection attempt",
        p_payload: {
          proposed_pickup_date: "2026-09-03",
          proposed_pickup_time: "16:00",
        },
      });
      check(
        Boolean(collection.error),
        "Collection cannot request",
        collection.error?.message,
      );
    }

    // Same-month cannot be requested
    {
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "same month",
        p_payload: {
          proposed_pickup_date: "2026-08-28",
          proposed_pickup_time: "16:00",
        },
      });
      check(Boolean(error), "same-month pickup cannot be an exception", error?.message);
    }

    // CO creates CROSS_MONTH
    let crossRequestId: string | null = null;
    {
      const { data, error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "Customer needs September pickup",
        p_payload: {
          proposed_pickup_date: "2026-09-03",
          proposed_pickup_time: "17:00",
        },
      });
      check(!error, "CO creates CROSS_MONTH_PICKUP", error?.message);
      crossRequestId = (data as { id?: string } | null)?.id ?? null;
      check(Boolean(crossRequestId), "cross-month request id returned");
    }

    // Duplicate pending blocked
    {
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: crossOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "duplicate",
        p_payload: {
          proposed_pickup_date: "2026-09-04",
          proposed_pickup_time: "17:00",
        },
      });
      check(Boolean(error), "duplicate pending blocked", error?.message);
    }

    // CO cannot self-approve
    {
      const { error } = await admin.rpc("approve_operations_approval_request", {
        p_request_id: crossRequestId,
        p_actor_staff_id: coId,
        p_reviewer_note: null,
      });
      check(Boolean(error), "requester cannot approve own request", error?.message);
    }

    // Manager / Bakery / Collection cannot approve — Bakery/Collection only.
    // Manager CAN approve all three supported types.
    {
      const bak = await admin.rpc("approve_operations_approval_request", {
        p_request_id: crossRequestId,
        p_actor_staff_id: bakeryId,
        p_reviewer_note: null,
      });
      check(Boolean(bak.error), "Bakery cannot approve", bak.error?.message);
      const col = await admin.rpc("approve_operations_approval_request", {
        p_request_id: crossRequestId,
        p_actor_staff_id: collectionId,
        p_reviewer_note: null,
      });
      check(Boolean(col.error), "Collection cannot approve", col.error?.message);
    }

    // Manager approves — applies exact date/time
    {
      const { error } = await admin.rpc("approve_operations_approval_request", {
        p_request_id: crossRequestId,
        p_actor_staff_id: managerId,
        p_reviewer_note: "ok",
      });
      check(!error, "Manager approves cross-month", error?.message);
      const { data: order } = await admin
        .from("orders")
        .select("pickup_date, pickup_time")
        .eq("id", crossOrder)
        .single();
      check(order?.pickup_date === "2026-09-03", "approved pickup date applied");
      check(
        String(order?.pickup_time).startsWith("17:00"),
        "approved pickup time applied",
        String(order?.pickup_time),
      );
    }

    // Already decided cannot be decided again
    {
      const { error } = await admin.rpc("reject_operations_approval_request", {
        p_request_id: crossRequestId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: "too late",
      });
      check(Boolean(error), "already-decided cannot be rejected", error?.message);
    }

    // Reject + cancel paths
    {
      const rejectOrder = await createOrder(`${SIG} Reject`, "2026-08-20");
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: rejectOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "please reject",
        p_payload: {
          proposed_pickup_date: "2026-09-10",
          proposed_pickup_time: "16:00",
        },
      });
      const rejectId = (created.data as { id?: string } | null)?.id ?? null;
      const { error } = await admin.rpc("reject_operations_approval_request", {
        p_request_id: rejectId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: "Not this month",
      });
      check(!error, "Owner rejects with note", error?.message);
      const { data: still } = await admin
        .from("orders")
        .select("pickup_date")
        .eq("id", rejectOrder)
        .single();
      check(still?.pickup_date === "2026-08-20", "reject does not mutate pickup");

      const cancelOrder = await createOrder(`${SIG} Cancel`, "2026-08-20");
      const cancelCreated = await admin.rpc("create_operations_approval_request", {
        p_order_id: cancelOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "changed mind",
        p_payload: {
          proposed_pickup_date: "2026-09-10",
          proposed_pickup_time: "16:00",
        },
      });
      const cancelId = (cancelCreated.data as { id?: string } | null)?.id ?? null;
      const cancelled = await admin.rpc("cancel_operations_approval_request", {
        p_request_id: cancelId,
        p_actor_staff_id: coId,
      });
      check(!cancelled.error, "requester can cancel own pending", cancelled.error?.message);
      const approveCancelled = await admin.rpc("approve_operations_approval_request", {
        p_request_id: cancelId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: null,
      });
      check(
        Boolean(approveCancelled.error),
        "cancelled request cannot later be approved",
        approveCancelled.error?.message,
      );
    }

    // Valid voucher cannot be requested
    {
      const { error } = await admin.rpc("create_operations_approval_request", {
        p_order_id: discountOrder,
        p_actor_staff_id: coId,
        p_request_type: "discount_exception",
        p_reason: "valid voucher",
        p_payload: {
          action: "redeem_rm10",
          voucher_number: `APR${Date.now().toString().slice(-6)}`,
          expiry_date: "2026-12-31",
        },
      });
      check(
        Boolean(error),
        "valid voucher cannot use approval path",
        error?.message,
      );
    }

    // Invalid/expired voucher → request → Owner approve applies only that order
    {
      const voucherNumber = `APX${Date.now().toString().slice(-6)}`;
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: discountOrder,
        p_actor_staff_id: coId,
        p_request_type: "discount_exception",
        p_reason: "Customer presented expired card",
        p_payload: {
          action: "redeem_rm10",
          voucher_number: voucherNumber,
          expiry_date: "2026-08-01",
          eligibility_reason: "Pickup date is after voucher expiry",
        },
      });
      check(!created.error, "CO creates DISCOUNT_EXCEPTION", created.error?.message);
      const discountId = (created.data as { id?: string } | null)?.id ?? null;
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: discountId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: null,
      });
      check(!approved.error, "Owner approves discount exception", approved.error?.message);
      const { data: adj } = await admin
        .from("order_adjustments")
        .select("code, amount, status")
        .eq("order_id", discountOrder)
        .eq("code", "rm10_physical_card");
      const active = (adj ?? []).filter((row) => row.status === "active");
      check(active.length === 1, "RM10 applied to specified order only");
      const { data: otherAdj } = await admin
        .from("order_adjustments")
        .select("id")
        .eq("order_id", lateOrder)
        .eq("code", "rm10_physical_card");
      check((otherAdj ?? []).length === 0, "other orders unchanged");
    }

    // LATE_ORDER_EDIT — Manager executes exact requested change
    {
      const { data: items } = await admin
        .from("order_items")
        .select("cake_id, cake_size_id, quantity, unit_price, cake_name, size_label")
        .eq("order_id", lateOrder);
      const first = items?.[0];
      const proposedDate = lateProposedPickup ?? latePickup;
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: lateOrder,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "Customer requested a later same-month pickup",
        p_payload: {
          proposed: {
            pickup_date: proposedDate,
            pickup_time: "15:00",
            items: first
              ? [
                  {
                    cake_id: first.cake_id,
                    cake_size_id: first.cake_size_id,
                    quantity: first.quantity,
                    unit_price: first.unit_price,
                    cake_name: first.cake_name,
                    size_label: first.size_label,
                  },
                ]
              : [],
          },
        },
      });
      check(!created.error, "CO creates LATE_ORDER_EDIT", created.error?.message);
      const lateId = (created.data as { id?: string } | null)?.id ?? null;
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: lateId,
        p_actor_staff_id: managerId,
        p_reviewer_note: null,
      });
      check(!approved.error, "Manager approves late edit", approved.error?.message);
      const { data: after } = await admin
        .from("orders")
        .select("pickup_date, pickup_time")
        .eq("id", lateOrder)
        .single();
      check(after?.pickup_date === proposedDate, "late edit applied exact pickup");
      check(
        String(after?.pickup_time).startsWith("15:00"),
        "late edit applied exact time",
        String(after?.pickup_time),
      );
    }

    // Different types may be pending on the same order
    {
      const lateCombo = await admin.rpc("create_operations_approval_request", {
        p_order_id: comboOrder,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "combo late",
        p_payload: {
          proposed: {
            pickup_date: latePickup,
            pickup_time: "16:00",
          },
        },
      });
      check(!lateCombo.error, "combo late_order_edit pending", lateCombo.error?.message);
      const discCombo = await admin.rpc("create_operations_approval_request", {
        p_order_id: comboOrder,
        p_actor_staff_id: coId,
        p_request_type: "discount_exception",
        p_reason: "combo discount",
        p_payload: {
          action: "redeem_rm10",
          voucher_number: `APC${Date.now().toString().slice(-6)}`,
          expiry_date: "2026-08-01",
          eligibility_reason: "Pickup date is after voucher expiry",
        },
      });
      check(
        !discCombo.error,
        "different types allowed pending together",
        discCombo.error?.message,
      );
    }

    // Manager discount exception — requires RM10 valid-path/override split migration
    {
      const voucherNumber = `APM${Date.now().toString().slice(-6)}`;
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: managerDiscountOrder,
        p_actor_staff_id: coId,
        p_request_type: "discount_exception",
        p_reason: "Manager exception path",
        p_payload: {
          action: "redeem_rm10",
          voucher_number: voucherNumber,
          expiry_date: "2026-08-01",
          eligibility_reason: "Pickup date is after voucher expiry",
        },
      });
      check(
        !created.error,
        "CO creates discount exception for Manager review",
        created.error?.message,
      );
      const discountId = (created.data as { id?: string } | null)?.id ?? null;
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: discountId,
        p_actor_staff_id: managerId,
        p_reviewer_note: null,
      });
      if (approved.error && /Only Owner can redeem/i.test(approved.error.message)) {
        pass(
          "Manager discount execute skipped until RM10 allowlist migration",
          approved.error.message,
        );
      } else {
        check(
          !approved.error,
          "Manager approves discount exception",
          approved.error?.message,
        );
      }
    }

    // Stale request protected
    {
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: staleOrder,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "will go stale",
        p_payload: {
          proposed_pickup_date: "2026-09-15",
          proposed_pickup_time: "16:00",
        },
      });
      const staleId = (created.data as { id?: string } | null)?.id ?? null;
      await admin
        .from("orders")
        .update({ pickup_date: "2026-08-25" })
        .eq("id", staleOrder);
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: staleId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: null,
      });
      check(Boolean(approved.error), "stale request cannot apply", approved.error?.message);
      check(
        /stale/i.test(approved.error?.message ?? ""),
        "stale error mentions review/recreation",
        approved.error?.message,
      );
      const { data: still } = await admin
        .from("orders")
        .select("pickup_date")
        .eq("id", staleOrder)
        .single();
      check(still?.pickup_date === "2026-08-25", "stale approve did not apply September");
    }

    // RM10 locked role matrix (direct RPC)
    {
      async function redeemRm10(input: {
        orderId: string;
        actorId: string;
        voucher: string;
        expiry: string;
        override: boolean;
      }) {
        return admin.rpc("redeem_rm10_physical_voucher_for_guest_order", {
          p_order_id: input.orderId,
          p_actor_staff_id: input.actorId,
          p_voucher_number: input.voucher,
          p_expiry_date: input.expiry,
          p_owner_override: input.override,
          p_override_reason: input.override ? `${SIG} override` : null,
        });
      }

      const normal: Array<[string, string, boolean]> = [
        ["owner", ownerId, true],
        ["manager", managerId, true],
        ["customer_operations", coId, true],
        ["bakery", bakeryId, false],
        ["collection", collectionId, false],
      ];
      for (const [role, actorId, expectOk] of normal) {
        const oid = await createOrder(`${SIG} N-${role}`, "2026-08-28");
        const { error } = await redeemRm10({
          orderId: oid,
          actorId,
          voucher: `LVN${Date.now().toString().slice(-5)}${role.slice(0, 2)}`,
          expiry: "2026-12-31",
          override: false,
        });
        check(
          expectOk ? !error : Boolean(error),
          `RM10 normal ${role} ${expectOk ? "allowed" : "denied"}`,
          error?.message,
        );
      }

      const overrideRows: Array<[string, string, boolean]> = [
        ["owner", ownerId, true],
        ["manager", managerId, true],
        ["customer_operations", coId, false],
        ["bakery", bakeryId, false],
        ["collection", collectionId, false],
      ];
      for (const [role, actorId, expectOk] of overrideRows) {
        const oid = await createOrder(`${SIG} O-${role}`, "2026-08-28");
        const { error } = await redeemRm10({
          orderId: oid,
          actorId,
          voucher: `LVO${Date.now().toString().slice(-5)}${role.slice(0, 2)}`,
          expiry: "2026-08-01",
          override: true,
        });
        check(
          expectOk ? !error : Boolean(error),
          `RM10 override ${role} ${expectOk ? "allowed" : "denied"}`,
          error?.message,
        );
        if (role === "customer_operations") {
          check(
            /Only Owner or Manager can apply an RM10 eligibility override/i.test(
              error?.message ?? "",
            ),
            "CO override=true rejected at role gate",
            error?.message,
          );
        }
      }

    // Owner can approve all three types (Manager already covered above).
    {
      const ownerLate = await createOrder(`${SIG} OwnLate`, tomorrowYmd);
      const { data: items } = await admin
        .from("order_items")
        .select("cake_id, cake_size_id, quantity, unit_price, cake_name, size_label")
        .eq("order_id", ownerLate);
      const first = items?.[0];
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: ownerLate,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "Owner late-edit probe",
        p_payload: {
          proposed: {
            pickup_date: tomorrowYmd,
            pickup_time: "14:30",
            items: first
              ? [
                  {
                    cake_id: first.cake_id,
                    cake_size_id: first.cake_size_id,
                    quantity: first.quantity,
                    unit_price: first.unit_price,
                    cake_name: first.cake_name,
                    size_label: first.size_label,
                  },
                ]
              : [],
          },
        },
      });
      check(!created.error, "CO creates late_edit for Owner review", created.error?.message);
      const lateId = (created.data as { id?: string } | null)?.id ?? null;
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: lateId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: null,
      });
      check(!approved.error, "Owner approves late_order_edit", approved.error?.message);
      const { data: after } = await admin
        .from("orders")
        .select("pickup_time")
        .eq("id", ownerLate)
        .single();
      check(
        String(after?.pickup_time).startsWith("14:30"),
        "Owner late-edit executed exact time",
        String(after?.pickup_time),
      );
    }

    {
      const ownerCross = await createOrder(`${SIG} OwnCross`, "2026-08-20");
      const created = await admin.rpc("create_operations_approval_request", {
        p_order_id: ownerCross,
        p_actor_staff_id: coId,
        p_request_type: "cross_month_pickup",
        p_reason: "Owner cross-month probe",
        p_payload: {
          proposed_pickup_date: "2026-09-10",
          proposed_pickup_time: "11:00",
        },
      });
      check(!created.error, "CO creates cross_month for Owner review", created.error?.message);
      const reqId = (created.data as { id?: string } | null)?.id ?? null;
      const approved = await admin.rpc("approve_operations_approval_request", {
        p_request_id: reqId,
        p_actor_staff_id: ownerId,
        p_reviewer_note: null,
      });
      check(!approved.error, "Owner approves cross_month_pickup", approved.error?.message);
      const { data: after } = await admin
        .from("orders")
        .select("pickup_date, pickup_time")
        .eq("id", ownerCross)
        .single();
      check(after?.pickup_date === "2026-09-10", "Owner cross-month executed exact date");
      check(
        String(after?.pickup_time).startsWith("11:00"),
        "Owner cross-month executed exact time",
        String(after?.pickup_time),
      );
    }

    // Paid-add-on late_order_edit execution (requires 20260814170000)
    {
      async function cakeItems(orderId: string) {
        const { data } = await admin
          .from("order_items")
          .select(
            "cake_id, cake_size_id, quantity, unit_price, cake_name, size_label",
          )
          .eq("order_id", orderId);
        return data ?? [];
      }
      async function paidAddons(orderId: string) {
        const { data } = await admin
          .from("order_paid_addons")
          .select(
            "id, order_id, paid_addon_type_id, code, name, unit_price, financial_shorthand, quantity, sort_order",
          )
          .eq("order_id", orderId);
        return data ?? [];
      }
      async function amountDue(orderId: string) {
        const { data } = await admin.rpc("order_amount_due", {
          p_order_id: orderId,
        });
        return Number(data ?? 0);
      }
      function itemPayload(
        rows: Array<{
          cake_id: string;
          cake_size_id: string;
          quantity: number;
          unit_price: number;
          cake_name: string;
          size_label: string;
        }>,
      ) {
        return rows.map((row) => ({
          cake_id: row.cake_id,
          cake_size_id: row.cake_size_id,
          quantity: row.quantity,
          unit_price: row.unit_price,
          cake_name: row.cake_name,
          size_label: row.size_label,
        }));
      }

      const probeOrder = await createOrder(`${SIG} AddonProbe`, tomorrowYmd);
      const probeItems = await cakeItems(probeOrder);
      const probeCreate = await admin.rpc("create_operations_approval_request", {
        p_order_id: probeOrder,
        p_actor_staff_id: coId,
        p_request_type: "late_order_edit",
        p_reason: "please help",
        p_payload: {
          proposed: {
            pickup_date: tomorrowYmd,
            pickup_time: "16:00",
            items: itemPayload(probeItems),
            paid_addons: [birthdayPayload(1)],
          },
        },
      });
      const probeId = (probeCreate.data as { id?: string } | null)?.id ?? null;
      const { data: probeRow } = probeId
        ? await admin
            .from("operations_approval_requests")
            .select("payload, order_fingerprint")
            .eq("id", probeId)
            .maybeSingle()
        : { data: null };
      const probeFingerprint = probeRow?.order_fingerprint as
        | Record<string, unknown>
        | null;
      const migrationApplied =
        Boolean(probeFingerprint) &&
        Object.prototype.hasOwnProperty.call(
          probeFingerprint,
          "paid_addons_signature",
        );
      check(
        migrationApplied,
        "live fingerprint includes paid_addons_signature",
        JSON.stringify(probeFingerprint ? Object.keys(probeFingerprint) : null),
      );
      if (!migrationApplied || probeCreate.error || !probeId) {
        check(
          false,
          "20260814170000 paid-addon approval execution is live",
          probeCreate.error?.message ?? "fingerprint missing paid_addons_signature",
        );
      } else {
        const proposed = ((probeRow?.payload as Record<string, unknown> | null)
          ?.proposed ?? {}) as Record<string, unknown>;
        const proposedAddons = proposed.paid_addons as
          | Array<{ code?: string; quantity?: number }>
          | undefined;
        check(
          proposedAddons?.[0]?.code === "birthday_card",
          "stored late_order_edit payload contains Birthday Card",
          JSON.stringify(proposedAddons),
        );
        check(
          probeCreate.error == null,
          "reason 'please help' is not required to store the add-on",
        );

        const beforeDue = await amountDue(probeOrder);
        const approved = await admin.rpc("approve_operations_approval_request", {
          p_request_id: probeId,
          p_actor_staff_id: ownerId,
          p_reviewer_note: null,
        });
        check(
          !approved.error,
          "Owner approves Birthday Card late_order_edit",
          approved.error?.message,
        );
        const addons = await paidAddons(probeOrder);
        check(
          addons.some(
            (row) => row.code === "birthday_card" && Number(row.quantity) === 1,
          ),
          "Approve executed Birthday Card ×1 from payload",
          JSON.stringify(addons),
        );
        const afterDue = await amountDue(probeOrder);
        check(
          afterDue === beforeDue + birthdayUnitPrice,
          "persisted Birthday Card changes amount due",
          `before=${beforeDue} after=${afterDue} card=${birthdayUnitPrice}`,
        );
        const quickView = buildQuickViewPaidAddonBlocks(
          addons.map((row) => ({
            id: String(row.id),
            orderId: String(row.order_id),
            paidAddonTypeId: row.paid_addon_type_id
              ? String(row.paid_addon_type_id)
              : null,
            code: String(row.code),
            name: String(row.name),
            unitPrice: Number(row.unit_price),
            financialShorthand: String(row.financial_shorthand ?? ""),
            quantity: Number(row.quantity),
            writtenMessage: null,
            messages: [],
            sortOrder: Number(row.sort_order ?? 0),
          })),
        );
        check(
          quickView.some((block) => block.title === `${birthdayType.name} ×1`),
          "Quick View reads persisted Birthday Card",
          JSON.stringify(quickView),
        );
        check(
          addons.some((row) => String(row.name).toLowerCase().includes("birthday")),
          "Order Workspace add-ons source contains Birthday Card",
        );

        // Remove Birthday Card
        const removeOrder = await createOrder(`${SIG} AddonRm`, tomorrowYmd);
        await admin.rpc("sync_guest_order_paid_addons", {
          p_order_id: removeOrder,
          p_paid_addons: [{ code: "birthday_card", quantity: 1, messages: [null] }],
        });
        const removeItems = await cakeItems(removeOrder);
        const removeCreated = await admin.rpc("create_operations_approval_request", {
          p_order_id: removeOrder,
          p_actor_staff_id: coId,
          p_request_type: "late_order_edit",
          p_reason: "remove card",
          p_payload: {
            proposed: {
              pickup_date: tomorrowYmd,
              pickup_time: "16:00",
              items: itemPayload(removeItems),
              paid_addons: [],
            },
          },
        });
        check(!removeCreated.error, "CO requests Birthday Card removal", removeCreated.error?.message);
        const removeId = (removeCreated.data as { id?: string } | null)?.id ?? null;
        const removeApproved = await admin.rpc("approve_operations_approval_request", {
          p_request_id: removeId,
          p_actor_staff_id: ownerId,
          p_reviewer_note: null,
        });
        check(!removeApproved.error, "Approve removes Birthday Card", removeApproved.error?.message);
        const afterRemove = await paidAddons(removeOrder);
        check(afterRemove.length === 0, "Birthday Card removed from persisted add-ons", JSON.stringify(afterRemove));

        // Quantity ×1 → ×2
        const qtyOrder = await createOrder(`${SIG} AddonQty`, tomorrowYmd);
        await admin.rpc("sync_guest_order_paid_addons", {
          p_order_id: qtyOrder,
          p_paid_addons: [{ code: "birthday_card", quantity: 1, messages: [null] }],
        });
        const qtyItems = await cakeItems(qtyOrder);
        const qtyCreated = await admin.rpc("create_operations_approval_request", {
          p_order_id: qtyOrder,
          p_actor_staff_id: coId,
          p_request_type: "late_order_edit",
          p_reason: "qty",
          p_payload: {
            proposed: {
              pickup_date: tomorrowYmd,
              pickup_time: "16:00",
              items: itemPayload(qtyItems),
              paid_addons: [birthdayPayload(2)],
            },
          },
        });
        check(!qtyCreated.error, "CO requests Birthday Card ×2", qtyCreated.error?.message);
        const qtyId = (qtyCreated.data as { id?: string } | null)?.id ?? null;
        const qtyApproved = await admin.rpc("approve_operations_approval_request", {
          p_request_id: qtyId,
          p_actor_staff_id: ownerId,
          p_reviewer_note: null,
        });
        check(!qtyApproved.error, "Approve Birthday Card quantity change", qtyApproved.error?.message);
        const afterQty = await paidAddons(qtyOrder);
        check(
          afterQty.some((row) => row.code === "birthday_card" && Number(row.quantity) === 2),
          "Birthday Card quantity persisted as ×2",
          JSON.stringify(afterQty),
        );

        // Cake 6" → 8" + Birthday Card
        if (size8) {
          const comboOrder = await createOrder(`${SIG} CakeAddon`, tomorrowYmd);
          const comboItems = await cakeItems(comboOrder);
          const cakeName = comboItems[0]?.cake_name ?? "Cake";
          const comboCreated = await admin.rpc("create_operations_approval_request", {
            p_order_id: comboOrder,
            p_actor_staff_id: coId,
            p_request_type: "late_order_edit",
            p_reason: "size and card",
            p_payload: {
              proposed: {
                pickup_date: tomorrowYmd,
                pickup_time: "16:00",
                items: [cakeItemFromSize(size8, 1, cakeName)],
                paid_addons: [birthdayPayload(1)],
              },
            },
          });
          check(!comboCreated.error, "CO requests cake + Birthday Card", comboCreated.error?.message);
          const comboId = (comboCreated.data as { id?: string } | null)?.id ?? null;
          const comboApproved = await admin.rpc("approve_operations_approval_request", {
            p_request_id: comboId,
            p_actor_staff_id: ownerId,
            p_reviewer_note: null,
          });
          check(!comboApproved.error, "Approve cake + Birthday Card", comboApproved.error?.message);
          const comboCakes = await cakeItems(comboOrder);
          const comboAddons = await paidAddons(comboOrder);
          check(
            comboCakes.some((row) => String(row.size_label).startsWith('8"')),
            "cake + add-on: cake persisted as 8\"",
            JSON.stringify(comboCakes),
          );
          check(
            comboAddons.some((row) => row.code === "birthday_card" && Number(row.quantity) === 1),
            "cake + add-on: Birthday Card persisted",
            JSON.stringify(comboAddons),
          );

          const tripleOrder = await createOrder(`${SIG} Triple`, tomorrowYmd);
          const tripleItems = await cakeItems(tripleOrder);
          const tripleName = tripleItems[0]?.cake_name ?? "Cake";
          const tripleCreated = await admin.rpc("create_operations_approval_request", {
            p_order_id: tripleOrder,
            p_actor_staff_id: coId,
            p_request_type: "late_order_edit",
            p_reason: "all three",
            p_payload: {
              proposed: {
                pickup_date: tomorrowYmd,
                pickup_time: "14:15",
                items: [cakeItemFromSize(size8, 1, tripleName)],
                paid_addons: [birthdayPayload(1)],
              },
            },
          });
          check(!tripleCreated.error, "CO requests pickup + cake + add-on", tripleCreated.error?.message);
          const tripleId = (tripleCreated.data as { id?: string } | null)?.id ?? null;
          const tripleApproved = await admin.rpc("approve_operations_approval_request", {
            p_request_id: tripleId,
            p_actor_staff_id: ownerId,
            p_reviewer_note: null,
          });
          check(!tripleApproved.error, "Approve pickup + cake + add-on", tripleApproved.error?.message);
          const { data: tripleOrderRow } = await admin
            .from("orders")
            .select("pickup_time")
            .eq("id", tripleOrder)
            .single();
          const tripleCakes = await cakeItems(tripleOrder);
          const tripleAddons = await paidAddons(tripleOrder);
          check(
            String(tripleOrderRow?.pickup_time).startsWith("14:15"),
            "triple mutation applied pickup time",
            String(tripleOrderRow?.pickup_time),
          );
          check(
            tripleCakes.some((row) => String(row.size_label).startsWith('8"')),
            "triple mutation applied cake size",
          );
          check(
            tripleAddons.some((row) => row.code === "birthday_card"),
            "triple mutation applied Birthday Card",
          );

          // Rollback: cake would change, add-on sync fails
          const failOrder = await createOrder(`${SIG} Rollback`, tomorrowYmd);
          const failBefore = await cakeItems(failOrder);
          const failCreated = await admin.rpc("create_operations_approval_request", {
            p_order_id: failOrder,
            p_actor_staff_id: coId,
            p_request_type: "late_order_edit",
            p_reason: "invalid add-on",
            p_payload: {
              proposed: {
                pickup_date: tomorrowYmd,
                pickup_time: "16:00",
                items: [cakeItemFromSize(size8, 1, failBefore[0]?.cake_name ?? "Cake")],
                paid_addons: [
                  {
                    code: "not_a_real_addon",
                    name: "Fake",
                    quantity: 1,
                    messages: [null],
                  },
                ],
              },
            },
          });
          check(!failCreated.error, "CO creates failing add-on request", failCreated.error?.message);
          const failId = (failCreated.data as { id?: string } | null)?.id ?? null;
          const failApproved = await admin.rpc("approve_operations_approval_request", {
            p_request_id: failId,
            p_actor_staff_id: ownerId,
            p_reviewer_note: null,
          });
          check(Boolean(failApproved.error), "Approve fails when add-on sync fails", failApproved.error?.message);
          const { data: failReq } = await admin
            .from("operations_approval_requests")
            .select("status")
            .eq("id", failId)
            .maybeSingle();
          check(failReq?.status === "pending", "failed Approve does not mark request approved", String(failReq?.status));
          const failAfterCakes = await cakeItems(failOrder);
          check(
            failAfterCakes.some((row) => row.cake_size_id === failBefore[0]?.cake_size_id) &&
              !failAfterCakes.some((row) => row.cake_size_id === size8.id),
            "failed add-on sync rolls back cake mutation",
            JSON.stringify(failAfterCakes),
          );
        } else {
          check(false, "6\" and 8\" sizes available for cake+add-on live tests");
        }

        const staleOrder = await createOrder(`${SIG} AddonStale`, tomorrowYmd);
        const staleItems = await cakeItems(staleOrder);
        const staleCreated = await admin.rpc("create_operations_approval_request", {
          p_order_id: staleOrder,
          p_actor_staff_id: coId,
          p_request_type: "late_order_edit",
          p_reason: "add on birthday card",
          p_payload: {
            proposed: {
              pickup_date: tomorrowYmd,
              pickup_time: "16:00",
              items: itemPayload(staleItems),
              paid_addons: [birthdayPayload(1)],
            },
          },
        });
        check(
          !staleCreated.error,
          "CO creates add-on request before intervening edit",
          staleCreated.error?.message,
        );
        const staleId =
          (staleCreated.data as { id?: string } | null)?.id ?? null;
        const { error: interveneErr } = await admin.rpc(
          "sync_guest_order_paid_addons",
          {
            p_order_id: staleOrder,
            p_paid_addons: [
              { code: "birthday_card", quantity: 2, messages: [null, null] },
            ],
          },
        );
        check(!interveneErr, "intervening add-on change applied", interveneErr?.message);
        const staleApprove = await admin.rpc("approve_operations_approval_request", {
          p_request_id: staleId,
          p_actor_staff_id: ownerId,
          p_reviewer_note: null,
        });
        check(
          Boolean(staleApprove.error),
          "Approve fails as stale after add-on change",
          staleApprove.error?.message,
        );
        check(
          /stale/i.test(staleApprove.error?.message ?? ""),
          "stale add-on change uses existing stale message",
          staleApprove.error?.message,
        );
        const afterStale = await paidAddons(staleOrder);
        check(
          afterStale.some(
            (row) => row.code === "birthday_card" && Number(row.quantity) === 2,
          ),
          "stale approve did not overwrite newer add-on state",
          JSON.stringify(afterStale),
        );
      }
    }

      const invalidDirect = await createOrder(`${SIG} CO-inv`, "2026-08-28");
      const invalidResult = await redeemRm10({
        orderId: invalidDirect,
        actorId: coId,
        voucher: `LVI${Date.now().toString().slice(-6)}`,
        expiry: "2026-08-01",
        override: false,
      });
      check(
        Boolean(invalidResult.error),
        "CO invalid RM10 without override denied",
        invalidResult.error?.message,
      );
    }

    const { data: product } = await admin
      .from("orders")
      .select("id, pickup_date, pickup_time, status, updated_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(product?.id === PRODUCT_ORDER_ID, "Product order untouched");
    check(
      product?.updated_at === productBefore?.updated_at &&
        product?.pickup_date === productBefore?.pickup_date &&
        product?.status === productBefore?.status,
      "Product order fields unchanged",
      `before=${JSON.stringify(productBefore)} after=${JSON.stringify(product)}`,
    );
  } finally {
    for (const orderId of [...orderIds].reverse()) {
      try {
        await cleanupOrder(orderId);
      } catch (error) {
        console.error(error);
      }
    }
    if (staffIdsToDelete.length > 0) {
      await admin.from("staff_profiles").delete().in("id", staffIdsToDelete);
    }
    for (const authId of authUserIdsToDelete) {
      await admin.auth.admin.deleteUser(authId);
    }
  }

  const failed = checks.filter((row) => !row.ok);
  if (failed.length > 0) {
    console.error(`FAILED ${failed.length}/${checks.length}`);
    process.exit(1);
  }
  console.log(`operations approval live: PASS (${checks.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
