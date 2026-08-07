import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BrowseCakeRedirectPage({ params }: PageProps) {
  const { id } = await params;
  // Legacy mock browse IDs are not Milestone 1 cakes.
  if (
    id.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  ) {
    redirect(`/cakes/${id}`);
  }
  redirect("/");
}
