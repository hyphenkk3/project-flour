import { PageHeader } from "@/components/shell/PageHeader";
import { CakeForm } from "@/workspaces/library/cakes/CakeForm";

export const dynamic = "force-dynamic";

export default function NewLibraryCakePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable cake record."
        title="Add cake"
      />
      <CakeForm cancelHref="/library/cakes" mode="create" />
    </div>
  );
}
