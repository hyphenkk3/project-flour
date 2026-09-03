import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { CakeForm } from "@/workspaces/library/cakes/CakeForm";
import { CakePhotoManager } from "@/workspaces/library/cakes/CakePhotoManager";
import { getCakeById } from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

type EditCakePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryCakePage({
  params,
}: EditCakePageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const { id } = await params;
  const cake = await getCakeById(id);

  if (!cake) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={`/library/cakes/${cake.id}`}
        >
          ← {cake.name}
        </Link>
        <PageHeader
          description="Update this reusable cake record."
          title="Edit cake"
        />
      </div>
      <CakePhotoManager cake={cake} />
      <CakeForm
        cake={cake}
        cancelHref={`/library/cakes/${cake.id}`}
        mode="edit"
      />
    </div>
  );
}
