import { redirect } from "next/navigation";
import { getStaffByAuthUserId } from "@/foundation/staff/queries";
import { createClient } from "@/lib/supabase/server";
import type { StaffProfile } from "@/types/staff";

export async function getSessionStaff(): Promise<StaffProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const staff = await getStaffByAuthUserId(user.id);

  if (!staff || !staff.isActive) {
    await supabase.auth.signOut();
    return null;
  }

  return staff;
}

export async function requireStaff(): Promise<StaffProfile> {
  const staff = await getSessionStaff();

  if (!staff) {
    redirect("/login");
  }

  return staff;
}
