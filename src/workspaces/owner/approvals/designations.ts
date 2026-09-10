import { createClient } from "@/lib/supabase/server";

export const BAKERY_PREORDER_APPROVER_DESIGNATION = "bakery_preorder_approver";

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/** Named Bakery designation from staff_operational_designations. Never hardcode a staff UUID. */
export async function staffHasBakeryPreorderApprover(
  staffId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_operational_designations")
    .select("staff_id")
    .eq("staff_id", staffId)
    .eq("designation", BAKERY_PREORDER_APPROVER_DESIGNATION)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error.message)) return false;
    return false;
  }
  return Boolean(data?.staff_id);
}
