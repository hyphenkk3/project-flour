/**
 * EXTRA Activation v1 — live authority / lifecycle (isolated fixtures).
 * Run: npx tsx scripts/test-extra-activation-live.ts
 * Never mutates Product order 7e9779ac-….
 *
 * Cleanup: never process.exit after fixtures — throw so `finally` runs;
 * assert zero leftovers for this SIG.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isExtraAvailable } from "@/engines/extra/availability";
import {
  extraOperatingSlotsForDate,
  extraPickupThroughIso,
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
} from "@/engines/extra/fresh-picks-eligibility";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";

const PRODUCT_ORDER_ID = "7e9779ac-152b-42e0-8002-34ba8e9b11b5";
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260813160000_extra_activation_v1.sql",
);
const HARDENING_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260813170000_extra_reject_hardening.sql",
);

class MigrationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationBlockedError";
  }
}

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

const SIG = `EXTRAV1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(`fixture signature SIG=${SIG}`);

const TODAY_YMD = toBusinessDateKey();
const TOMORROW_YMD = addBusinessCalendarDays(TODAY_YMD, 1);
const nowForWindow = new Date();
const todaySlot = defaultExtraOrderCutoffSlot({
  cutoffDate: TODAY_YMD,
  todayYmd: TODAY_YMD,
  now: nowForWindow,
});
const CONFIRM_PREPARED_ON = todaySlot
  ? TODAY_YMD
  : (TOMORROW_YMD ?? TODAY_YMD);
const CONFIRM_SLOT =
  todaySlot ??
  defaultExtraOrderCutoffSlot({
    cutoffDate: CONFIRM_PREPARED_ON,
    todayYmd: TODAY_YMD,
    now: nowForWindow,
  }) ??
  extraOperatingSlotsForDate(CONFIRM_PREPARED_ON).at(-1) ??
  "17:30";
const CONFIRM_FROM_SLOT =
  defaultExtraPickupFromSlot({
    pickupFromDate: CONFIRM_PREPARED_ON,
    todayYmd: TODAY_YMD,
    now: nowForWindow,
  }) ??
  extraOperatingSlotsForDate(CONFIRM_PREPARED_ON)[0]?.value ??
  "12:00";
const CONFIRM_FROM = extraPickupThroughIso(
  CONFIRM_PREPARED_ON,
  CONFIRM_FROM_SLOT,
);
const CONFIRM_THROUGH = extraPickupThroughIso(
  CONFIRM_PREPARED_ON,
  CONFIRM_SLOT,
);

if (!CONFIRM_FROM || !CONFIRM_THROUGH) {
  throw new Error("Could not build a Fresh Picks pickup/order window");
}

type Check = { label: string; ok: boolean; detail?: string };

function rpcMessage(error: { message?: string } | null | undefined): string {
  return error?.message ?? "";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.log("SKIP live DB (missing Supabase env).");
    return;
  }

  const migrationHash = createHash("sha256")
    .update(readFileSync(MIGRATION_PATH))
    .digest("hex");
  const hardeningHash = createHash("sha256")
    .update(readFileSync(HARDENING_MIGRATION_PATH))
    .digest("hex");
  console.log(`migration sha256=${migrationHash}`);
  console.log(`hardening sha256=${hardeningHash}`);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Check[] = [];
  const extraIds: string[] = [];
  const staffIdsToDelete: string[] = [];
  const authUserIdsToDelete: string[] = [];
  let migrationBlocked = false;

  function check(ok: boolean, label: string, detail?: string) {
    checks.push({ label, ok, detail });
    console.log(
      `${ok ? "PASS" : "FAIL"} — ${label}${detail ? `: ${detail}` : ""}`,
    );
  }

  try {
    const probe = await admin.rpc("propose_extra_stock", {
      p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
      p_cake_name: "x",
      p_size_label: "y",
    });
    if (probe.error?.message?.includes("Could not find the function")) {
      throw new MigrationBlockedError(
        "propose_extra_stock missing — apply 20260813160000_extra_activation_v1.sql",
      );
    }
    const undoProbe = await admin.rpc("undo_extra_stock_rejected", {
      p_extra_stock_id: "00000000-0000-0000-0000-000000000000",
      p_actor_staff_id: "00000000-0000-0000-0000-000000000000",
    });
    if (undoProbe.error?.message?.includes("Could not find the function")) {
      throw new MigrationBlockedError(
        "undo_extra_stock_rejected missing — apply 20260813170000_extra_reject_hardening.sql",
      );
    }

    const { data: roles } = await admin.from("roles").select("id, code");
    const roleByCode = new Map((roles ?? []).map((r) => [r.code, r.id]));

    async function staffForRole(code: string) {
      const roleId = roleByCode.get(code);
      if (!roleId) return null;
      const { data } = await admin
        .from("staff_profiles")
        .select("id, role_id")
        .eq("role_id", roleId)
        .limit(1)
        .maybeSingle();
      return data;
    }

    async function createEphemeralStaff(roleCode: string, label: string) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) throw new Error(`${roleCode} role missing`);
      const email = `extrav1-${label}-${Date.now()}@whitebird.dev`;
      const { data: authCreated, error: authErr } =
        await admin.auth.admin.createUser({
          email,
          password: `TmpExtra_${Date.now()}!`,
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
          username: `ex${label}${Date.now().toString().slice(-6)}`.slice(0, 24),
          email,
          display_name: `${SIG} ${label}`,
          role_id: roleId,
          is_active: true,
        })
        .select("id")
        .single();
      if (profileErr || !profile?.id) {
        throw new Error(profileErr?.message ?? `Failed profile ${label}`);
      }
      staffIdsToDelete.push(profile.id);
      return profile;
    }

    const owner = await staffForRole("owner");
    const bakery = await staffForRole("bakery");
    const manager = await staffForRole("manager");
    let collection = await staffForRole("collection");
    const co = await staffForRole("customer_operations");

    if (!owner?.id) throw new Error("No owner staff_profiles row");
    const bakeryActor = bakery?.id ? bakery : manager?.id ? manager : owner;
    check(
      Boolean(bakeryActor?.id),
      "bakery-capable actor resolved",
      bakery?.id ? "bakery" : manager?.id ? "manager" : "owner",
    );
    if (!collection?.id) {
      collection = await createEphemeralStaff("collection", "col");
      check(Boolean(collection?.id), "ephemeral collection staff created");
    }

    const { data: productBefore } = await admin
      .from("orders")
      .select("id, status, ready_at, picked_up_at, production_started_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(Boolean(productBefore), "Product order still present");

    if (collection?.id) {
      const { error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: collection.id,
        p_cake_name: `Cake ${SIG}`,
        p_size_label: '6"',
        p_note: SIG,
      });
      check(Boolean(error), "collection propose denied", rpcMessage(error));
    }

    if (co?.id) {
      const { error } = await admin.rpc("create_confirmed_extra_stock", {
        p_actor_staff_id: co.id,
        p_cake_name: `Cake ${SIG}`,
        p_size_label: '6"',
        p_prepared_on: CONFIRM_PREPARED_ON,
        p_pickup_available_from_at: CONFIRM_FROM,
        p_pickup_through_at: CONFIRM_THROUGH,
        p_note: SIG,
      });
      check(Boolean(error), "CO create confirmed denied", rpcMessage(error));
    } else {
      check(true, "CO create confirmed denied (SKIP — no CO staff)");
    }

    let proposedId = "";
    {
      const { data, error } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: owner.id,
        p_cake_name: `Owner Propose ${SIG}`,
        p_size_label: '6"',
        p_prepared_on: "2026-08-15",
        p_note: SIG,
      });
      check(!error, "owner propose", rpcMessage(error));
      proposedId = data?.id as string;
      if (proposedId) extraIds.push(proposedId);
      check(data?.lifecycle === "proposed", "owner propose lifecycle proposed");
      check(
        !isExtraAvailable({
          lifecycle: data?.lifecycle ?? "proposed",
          pickupThroughAt: data?.pickup_through_at ?? null,
        }),
        "proposed not available",
      );
    }

    {
      const { error } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposedId,
        p_actor_staff_id: bakeryActor!.id,
        p_prepared_on: "2026-08-15",
        p_pickup_through_at: null,
      });
      check(
        Boolean(error),
        "confirm without pickup_through denied",
        rpcMessage(error),
      );
    }

    {
      const { data, error } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: proposedId,
        p_actor_staff_id: bakeryActor!.id,
        p_prepared_on: CONFIRM_PREPARED_ON,
        p_pickup_available_from_at: CONFIRM_FROM,
        p_pickup_through_at: CONFIRM_THROUGH,
      });
      check(!error, "bakery-capable confirm", rpcMessage(error));
      check(data?.lifecycle === "confirmed", "confirm lifecycle");
      check(
        isExtraAvailable({
          lifecycle: "confirmed",
          pickupThroughAt: CONFIRM_THROUGH,
          now: new Date(CONFIRM_THROUGH),
        }),
        "available at exact cutoff",
      );
      check(
        !isExtraAvailable({
          lifecycle: "confirmed",
          pickupThroughAt: CONFIRM_THROUGH,
          now: new Date(Date.parse(CONFIRM_THROUGH) + 1),
        }),
        "unavailable 1ms after cutoff",
      );
    }

    {
      const { data: prop, error: pErr } = await admin.rpc("propose_extra_stock", {
        p_actor_staff_id: owner.id,
        p_cake_name: `Reject Me ${SIG}`,
        p_size_label: '8"',
        p_note: SIG,
      });
      check(!pErr, "second owner propose", rpcMessage(pErr));
      const id = prop?.id as string;
      if (id) extraIds.push(id);
      const proposedAt = prop?.proposed_at as string;
      const proposedBy = prop?.proposed_by as string;

      {
        const { error } = await admin.rpc("reject_extra_stock", {
          p_extra_stock_id: id,
          p_actor_staff_id: bakeryActor!.id,
          p_reject_reason: null,
        });
        check(Boolean(error), "reject missing reason denied", rpcMessage(error));
      }
      {
        const { error } = await admin.rpc("reject_extra_stock", {
          p_extra_stock_id: id,
          p_actor_staff_id: bakeryActor!.id,
          p_reject_reason: "   ",
        });
        check(
          Boolean(error),
          "reject whitespace-only reason denied",
          rpcMessage(error),
        );
      }
      if (collection?.id) {
        const { error } = await admin.rpc("reject_extra_stock", {
          p_extra_stock_id: id,
          p_actor_staff_id: collection.id,
          p_reject_reason: "not for collection",
        });
        check(Boolean(error), "collection reject denied", rpcMessage(error));
      }
      if (co?.id) {
        const { error } = await admin.rpc("undo_extra_stock_rejected", {
          p_extra_stock_id: id,
          p_actor_staff_id: co.id,
        });
        check(Boolean(error), "CO undo reject denied", rpcMessage(error));
      }

      const { data: rej, error: rErr } = await admin.rpc("reject_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: bakeryActor!.id,
        p_reject_reason: "  not physical  ",
      });
      check(!rErr, "bakery-capable reject with reason", rpcMessage(rErr));
      check(rej?.lifecycle === "rejected", "reject lifecycle");
      check(
        rej?.reject_reason === "not physical",
        "reject_reason persisted trimmed",
        String(rej?.reject_reason ?? ""),
      );
      check(
        !isExtraAvailable({
          lifecycle: rej?.lifecycle ?? "rejected",
          pickupThroughAt: rej?.pickup_through_at ?? null,
        }),
        "rejected never available",
      );
      check(rej?.proposed_at === proposedAt, "proposed_at preserved after reject");
      check(rej?.proposed_by === proposedBy, "proposed_by preserved after reject");

      if (collection?.id) {
        const { error } = await admin.rpc("undo_extra_stock_rejected", {
          p_extra_stock_id: id,
          p_actor_staff_id: collection.id,
        });
        check(Boolean(error), "collection undo reject denied", rpcMessage(error));
      }

      const { data: undone, error: uErr } = await admin.rpc(
        "undo_extra_stock_rejected",
        {
          p_extra_stock_id: id,
          p_actor_staff_id: bakeryActor!.id,
        },
      );
      check(!uErr, "bakery-capable undo reject", rpcMessage(uErr));
      check(undone?.id === id, "undo reject same row id");
      check(undone?.lifecycle === "proposed", "undo reject lifecycle proposed");
      check(undone?.proposed_at === proposedAt, "proposed_at preserved after undo");
      check(undone?.proposed_by === proposedBy, "proposed_by preserved after undo");
      check(undone?.rejected_at == null, "rejected_at cleared after undo");
      check(undone?.rejected_by == null, "rejected_by cleared after undo");
      check(undone?.reject_reason == null, "reject_reason cleared after undo");
      check(
        !isExtraAvailable({
          lifecycle: undone?.lifecycle ?? "proposed",
          pickupThroughAt: undone?.pickup_through_at ?? null,
        }),
        "undo reject does not make available",
      );

      {
        const { error } = await admin.rpc("confirm_extra_stock", {
          p_extra_stock_id: id,
          p_actor_staff_id: bakeryActor!.id,
          p_prepared_on: CONFIRM_PREPARED_ON,
          p_pickup_through_at: null,
        });
        check(
          Boolean(error),
          "confirm after undo still requires pickup_through",
          rpcMessage(error),
        );
      }

      const { data: rec, error: cErr } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: bakeryActor!.id,
        p_prepared_on: CONFIRM_PREPARED_ON,
        p_pickup_available_from_at: CONFIRM_FROM,
        p_pickup_through_at: CONFIRM_THROUGH,
      });
      check(!cErr, "confirm after undo", rpcMessage(cErr));
      check(rec?.lifecycle === "confirmed", "confirm after undo lifecycle");
      check(
        isExtraAvailable({
          lifecycle: "confirmed",
          pickupThroughAt: CONFIRM_THROUGH,
          now: new Date(CONFIRM_THROUGH),
        }),
        "available after confirm following undo",
      );
    }

    {
      const { data, error } = await admin.rpc("create_confirmed_extra_stock", {
        p_actor_staff_id: bakeryActor!.id,
        p_cake_name: `Direct ${SIG}`,
        p_size_label: '6"',
        p_prepared_on: CONFIRM_PREPARED_ON,
        p_pickup_available_from_at: CONFIRM_FROM,
        p_pickup_through_at: CONFIRM_THROUGH,
        p_note: SIG,
      });
      check(!error, "bakery-capable direct create confirmed", rpcMessage(error));
      if (data?.id) extraIds.push(data.id as string);
      check(data?.lifecycle === "confirmed", "direct create lifecycle");
      check(
        data?.confirmed_by === bakeryActor!.id,
        "direct create confirmer",
      );
    }

    {
      const id = extraIds[extraIds.length - 1];
      const { error } = await admin.rpc("confirm_extra_stock", {
        p_extra_stock_id: id,
        p_actor_staff_id: bakeryActor!.id,
        p_prepared_on: CONFIRM_PREPARED_ON,
        p_pickup_available_from_at: CONFIRM_FROM,
        p_pickup_through_at: CONFIRM_THROUGH,
      });
      check(Boolean(error), "reconfirm confirmed denied", rpcMessage(error));
    }

    const { data: productAfter } = await admin
      .from("orders")
      .select("id, status, ready_at, picked_up_at, production_started_at")
      .eq("id", PRODUCT_ORDER_ID)
      .maybeSingle();
    check(
      JSON.stringify(productBefore) === JSON.stringify(productAfter),
      "Product order unchanged",
    );

    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      throw new Error(`${failed.length} check(s) failed`);
    }
    console.log(`\nEXTRA live: ${checks.length}/${checks.length} PASS`);
  } catch (err) {
    if (err instanceof MigrationBlockedError) {
      migrationBlocked = true;
      console.log(`BLOCKED — ${err.message}`);
      process.exitCode = 2;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (extraIds.length > 0) {
      await admin.from("extra_stock").delete().in("id", extraIds);
    }
    const { data: leftoverByNote } = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    for (const row of leftoverByNote ?? []) {
      await admin.from("extra_stock").delete().eq("id", row.id);
    }

    if (staffIdsToDelete.length > 0) {
      await admin.from("staff_profiles").delete().in("id", staffIdsToDelete);
    }
    for (const authId of authUserIdsToDelete) {
      await admin.auth.admin.deleteUser(authId);
    }

    const { data: still } = await admin
      .from("extra_stock")
      .select("id")
      .or(`note.eq.${SIG},cake_name.ilike.%${SIG}%`);
    if ((still ?? []).length > 0) {
      console.error(
        `AUDIT leftover EXTRA fixtures for SIG=${SIG}: ${(still ?? [])
          .map((r) => r.id)
          .join(", ")}`,
      );
      process.exitCode = 1;
    } else if (!migrationBlocked) {
      console.log(`Cleanup OK — zero EXTRA leftovers for SIG=${SIG}`);
    }

    if (staffIdsToDelete.length > 0) {
      const { data: leftoverStaff } = await admin
        .from("staff_profiles")
        .select("id")
        .in("id", staffIdsToDelete);
      if ((leftoverStaff ?? []).length > 0) {
        console.error(
          `AUDIT leftover EXTRA staff for SIG=${SIG}: ${(leftoverStaff ?? [])
            .map((r) => r.id)
            .join(", ")}`,
        );
        process.exitCode = 1;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
