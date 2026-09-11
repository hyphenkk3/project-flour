export type RoleCode =
  "owner" | "manager" | "customer_operations" | "bakery" | "collection";

export type Role = {
  id: string;
  code: RoleCode;
  name: string;
};

export type StaffProfile = {
  id: string;
  authUserId: string;
  username: string;
  email: string | null;
  displayName: string;
  roleId: string;
  isActive: boolean;
  isMasterOwner: boolean;
  role: Role;
};
