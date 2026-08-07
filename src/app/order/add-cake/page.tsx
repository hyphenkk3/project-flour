import { redirect } from "next/navigation";

/** Retired dropdown add-cake flow — browse the Collection instead. */
export default function AddCakeRedirectPage() {
  redirect("/");
}
