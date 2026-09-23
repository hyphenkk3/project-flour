import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { StorefrontFaqRecord } from "@/engines/storefront/faq";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary, canViewLibrary } from "@/foundation/navigation/access";
import { CustomerQaManager } from "@/workspaces/library/customer-qa/CustomerQaManager";
import { listStorefrontFaqItems } from "@/workspaces/library/customer-qa/queries";

export const dynamic = "force-dynamic";

export default async function LibraryCustomerQaPage() {
  const staff = await requireStaff();
  if (!canViewLibrary(staff.role.code)) {
    redirect("/home");
  }

  const canManage = canManageLibrary(staff.role.code);
  const loaded = await listStorefrontFaqItems()
    .then((items) => ({ items, error: null as string | null }))
    .catch((error: unknown) => ({
      items: [] as StorefrontFaqRecord[],
      error:
        error instanceof Error
          ? error.message
          : "Could not load Customer Q&A.",
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        description="Edit the questions customers see on the public FAQ page. This copy is informational only and does not change preorder, delivery, dine-in, operating hours, or Fresh Picks rules."
        title="Customer Q&A"
      />
      {loaded.error ? (
        <EmptyState description={loaded.error} title="Customer Q&A unavailable" />
      ) : (
        <CustomerQaManager canManage={canManage} items={loaded.items} />
      )}
    </div>
  );
}
