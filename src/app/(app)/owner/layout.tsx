import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    redirect("/home");
  }

  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</div>;
}
