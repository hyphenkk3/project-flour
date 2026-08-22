import { redirect } from "next/navigation";

/** Retired dropdown add-cake flow — browse published cakes instead. */
export default function AddCakeRedirectPage() {
  redirect("/browse");
}
