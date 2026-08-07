import { PageHeader } from "@/components/shell/PageHeader";
import { PromotionForm } from "@/workspaces/library/promotions/PromotionForm";

export const dynamic = "force-dynamic";

export default function NewLibraryPromotionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable promotion record."
        title="Add promotion"
      />
      <PromotionForm cancelHref="/library/promotions" mode="create" />
    </div>
  );
}
