import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role, RoleCode, StaffProfile } from "@/types/staff";

type RoleRow = {
  id: string;
  code: string;
  name: string;
};

type StaffProfileRow = {
  id: string;
  auth_user_id: string;
  username: string;
  email: string | null;
  display_name: string;
  role_id: string;
  is_active: boolean;
  roles: RoleRow | RoleRow[];
};

function unwrapRole(roles: RoleRow | RoleRow[]): Role {
  const row = Array.isArray(roles) ? roles[0] : roles;

  if (!row) {
    throw new Error("Staff profile is missing a role.");
  }

  return {
    id: row.id,
    code: row.code as RoleCode,
    name: row.name,
  };
}

function mapStaffProfile(row: StaffProfileRow): StaffProfile {
  const role = unwrapRole(row.roles);

  return {
    id: row.id,
    authUserId: row.auth_user_id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    roleId: row.role_id,
    isActive: row.is_active,
    role,
  };
}

const staffSelect = `
  id,
  auth_user_id,
  username,
  email,
  display_name,
  role_id,
  is_active,
  roles!inner (
    id,
    code,
    name
  )
`;

export async function findStaffByUsername(username: string) {
  const admin = createServiceClient();
  const normalized = username.trim();

  const { data, error } = await admin
    .from("staff_profiles")
    .select(staffSelect)
    .eq("username", normalized)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapStaffProfile(data as unknown as StaffProfileRow) : null;
}

export async function getStaffByAuthUserId(authUserId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select(staffSelect)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapStaffProfile(data as unknown as StaffProfileRow) : null;
}

export async function getAuthEmailForUserId(authUserId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.getUserById(authUserId);

  if (error) {
    throw error;
  }

  return data.user.email ?? null;
}
