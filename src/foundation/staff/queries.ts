import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";
import { STAFF_ROLE_CODES } from "@/foundation/staff/admin-guards";
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
  is_master_owner: boolean;
  must_change_password: boolean;
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
    isMasterOwner: Boolean(row.is_master_owner),
    mustChangePassword: Boolean(row.must_change_password),
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
  is_master_owner,
  must_change_password,
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
  const supabase = await createClient({ timeoutMs: AUTH_FETCH_TIMEOUT_MS });

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

export type StaffAdminListItem = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  isActive: boolean;
  isMasterOwner: boolean;
  role: Role;
};

function toAdminListItem(staff: StaffProfile): StaffAdminListItem {
  return {
    id: staff.id,
    username: staff.username,
    email: staff.email,
    displayName: staff.displayName,
    isActive: staff.isActive,
    isMasterOwner: staff.isMasterOwner,
    role: staff.role,
  };
}

export async function listStaffProfilesForAdmin(): Promise<StaffAdminListItem[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("staff_profiles")
    .select(staffSelect)
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => toAdminListItem(mapStaffProfile(row as unknown as StaffProfileRow)))
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName);
    });
}

export async function listStaffRoles(): Promise<Role[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("roles")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((row): row is { id: string; code: RoleCode; name: string } =>
      typeof row.id === "string" &&
      typeof row.code === "string" &&
      typeof row.name === "string" &&
      (STAFF_ROLE_CODES as readonly string[]).includes(row.code),
    )
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
    }));
}

export async function getStaffProfileByIdForAdmin(staffId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("staff_profiles")
    .select(staffSelect)
    .eq("id", staffId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapStaffProfile(data as unknown as StaffProfileRow) : null;
}

export async function countActiveOwners(): Promise<number> {
  const admin = createServiceClient();
  const { data: ownerRole, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("code", "owner")
    .maybeSingle();

  if (roleError) {
    throw roleError;
  }
  if (!ownerRole?.id) {
    return 0;
  }

  const { count, error } = await admin
    .from("staff_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", ownerRole.id)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}
