import { redirect } from "next/navigation";

export default function LegacyCounterPreviewRedirect() {
  redirect("/preview/collection");
}
