import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CakeForm } from "@/workspaces/library/cakes/CakeForm";
import { getCakeById } from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

type EditCakePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryCakePage({
  params,
}: EditCakePageProps) {
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
      <CakeForm
        cake={cake}
        cancelHref={`/library/cakes/${cake.id}`}
        mode="edit"
      />
    </div>
  );
}
