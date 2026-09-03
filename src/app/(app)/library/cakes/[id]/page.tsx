import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CakePhotoManager } from "@/workspaces/library/cakes/CakePhotoManager";
import { deleteCakeAction } from "@/workspaces/library/cakes/actions";
import { getCakeById } from "@/workspaces/library/cakes/queries";
import { DeleteLibraryItemButton } from "@/workspaces/library/DeleteLibraryItemButton";
import {
  cakeCategoryLabel,
  cakeStatusLabel,
  formatLibraryMoney,
  libraryStatusTone,
} from "@/workspaces/library/labels";

export const dynamic = "force-dynamic";

type CakeDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LibraryCakeDetailPage({
  params,
}: CakeDetailPageProps) {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const { id } = await params;
  const cake = await getCakeById(id);

  if (!cake) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            className="text-skyline hover:text-ink text-sm font-medium"
            href="/library/cakes"
          >
            ← Cake Library
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={cakeStatusLabel(cake.status)}
              tone={libraryStatusTone(cake.status)}
            />
            <StatusBadge
              label={cakeCategoryLabel(cake.category)}
              tone="neutral"
            />
          </div>
          <div className="min-w-0 [&_h2]:break-words">
            <PageHeader title={cake.name} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 sm:justify-end">
          {canManage ? (
            <>

          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
            href={`/library/cakes/${cake.id}/edit`}
          >
            Edit
          </Link>
          <DeleteLibraryItemButton
            action={deleteCakeAction.bind(null, cake.id)}
          />
                    </>
          ) : null}
        </div>
      </div>

      <dl className="border-fog grid gap-4 rounded-xl border bg-white p-5 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-skyline">Description</dt>
          <dd className="text-ink mt-1 whitespace-pre-wrap">
            {cake.description ?? "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-skyline">Sharing guide</dt>
          <dd className="text-ink mt-1 whitespace-pre-wrap">
            {cake.sharingGuide ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Allergens</dt>
          <dd className="text-ink mt-1">
            {cake.allergens.length > 0 ? cake.allergens.join(", ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Bakery notes</dt>
          <dd className="text-ink mt-1 whitespace-pre-wrap">
            {cake.bakeryNotes ?? "—"}
          </dd>
        </div>
      </dl>

      <section className="border-fog rounded-xl border bg-white p-5">
        <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
          Sizes
        </h2>
        {cake.sizes.length === 0 ? (
          <p className="text-skyline mt-3 text-sm">No sizes yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {cake.sizes.map((size) => (
              <li className="text-ink flex justify-between gap-3" key={size.id}>
                <span>
                  {size.label}
                  <span className="text-skyline">
                    {" "}
                    · Preorder: {size.preorderDays}{" "}
                    {size.preorderDays === 1 ? "day" : "days"}
                  </span>
                </span>
                <span className="font-medium">
                  {formatLibraryMoney(size.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CakePhotoManager cake={cake} canManage={false} />
    </div>
  );
}
