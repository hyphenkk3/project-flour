import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { PromotionForm } from "@/workspaces/library/promotions/PromotionForm";
import { getPromotionById } from "@/workspaces/library/promotions/queries";

export const dynamic = "force-dynamic";

type EditPromotionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryPromotionPage({
  params,
}: EditPromotionPageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const { id } = await params;
  const promotion = await getPromotionById(id);

  if (!promotion) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={`/library/promotions/${promotion.id}`}
        >
          ← {promotion.name}
        </Link>
        <PageHeader
          description="Update this reusable promotion record."
          title="Edit promotion"
        />
      </div>
      <PromotionForm
        cancelHref={`/library/promotions/${promotion.id}`}
        mode="edit"
        promotion={promotion}
      />
    </div>
  );
}
