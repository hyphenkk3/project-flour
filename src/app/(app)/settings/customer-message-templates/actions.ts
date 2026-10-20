"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  validateCustomerMessageTemplateBody,
  type CustomerMessageTemplateKey,
} from "@/engines/customer-message-templates";

function assertManager(roleCode: string) {
  if (roleCode !== "owner" && roleCode !== "manager") {
    throw new Error("Only Owner or Manager can manage customer message templates.");
  }
}

export async function saveCustomerMessageTemplateAction(input: {
  templateKey: CustomerMessageTemplateKey;
  body: string;
  expectedRevision: number;
}) {
  const staff = await requireStaff();
  assertManager(staff.role.code);
  const validation = validateCustomerMessageTemplateBody(input.templateKey, input.body);
  if (!validation.valid) return { ok: false as const, error: validation.reason };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_customer_message_template", {
    p_template_key: input.templateKey,
    p_body: input.body,
    p_expected_revision: input.expectedRevision,
  });
  if (error) return { ok: false as const, error: error.message.includes("revision conflict")
    ? "This template changed in another session. Reload the latest version before saving."
    : "The template could not be saved. Please try again." };
  revalidatePath("/settings/customer-message-templates");
  revalidatePath("/orders");
  revalidatePath("/collection");
  return { ok: true as const };
}

export async function resetCustomerMessageTemplateAction(input: {
  templateKey: CustomerMessageTemplateKey;
  expectedRevision: number;
}) {
  const staff = await requireStaff();
  assertManager(staff.role.code);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_customer_message_template", {
    p_template_key: input.templateKey,
    p_expected_revision: input.expectedRevision,
  });
  if (error) return { ok: false as const, error: "The default could not be restored. Reload and try again." };
  revalidatePath("/settings/customer-message-templates");
  revalidatePath("/orders");
  revalidatePath("/collection");
  return { ok: true as const };
}

export async function restoreCustomerMessageTemplateRevisionAction(input: {
  templateKey: CustomerMessageTemplateKey;
  revision: number;
  expectedRevision: number;
}) {
  const staff = await requireStaff();
  assertManager(staff.role.code);
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_customer_message_template_revision", {
    p_template_key: input.templateKey,
    p_revision: input.revision,
    p_expected_revision: input.expectedRevision,
  });
  if (error) return { ok: false as const, error: "That revision could not be restored. Reload and try again." };
  revalidatePath("/settings/customer-message-templates");
  revalidatePath("/orders");
  revalidatePath("/collection");
  return { ok: true as const };
}

export async function getCustomerMessageTemplateRevisionsAction(templateKey: CustomerMessageTemplateKey) {
  const staff = await requireStaff();
  assertManager(staff.role.code);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_message_template_revisions")
    .select("revision,action,previous_body,new_body,actor_display_name,created_at")
    .eq("template_key", templateKey)
    .order("revision", { ascending: false })
    .limit(30);
  if (error) return { ok: false as const, revisions: [] };
  return { ok: true as const, revisions: data ?? [] };
}
