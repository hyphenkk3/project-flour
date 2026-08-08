import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { StaffGuestOrderForm } from "@/workspaces/owner/orders/StaffGuestOrderForm";
import { listCollectionComplimentaryOptions } from "@/workspaces/owner/orders/queries";
import {
  getCurrentCollection,
  listOfferableLibraryCakes,
} from "@/workspaces/storefront/catalog/queries";

export const dynamic = "force-dynamic";

export default async function OwnerNewOrderPage() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    redirect("/home");
  }

  const cakes = await listOfferableLibraryCakes();
  const collection = await getCurrentCollection();
  const complimentaryOptions = collection
    ? await listCollectionComplimentaryOptions(collection.id)
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href="/owner"
        >
          ← Operations
        </Link>
        <PageHeader title="New Order" />
        <p className="text-skyline -mt-2 text-sm">
          Manually create a guest preorder (Jotform, WhatsApp, Instagram, Wee,
          Lex, or Other). Cakes come from Master Library — not limited by
          Collection membership.
        </p>
      </div>

      <StaffGuestOrderForm
        cakes={cakes}
        complimentaryOptions={complimentaryOptions}
      />
    </div>
  );
}
