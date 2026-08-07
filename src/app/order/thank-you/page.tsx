import { redirect } from "next/navigation";

export default function ThankYouRedirectPage() {
  redirect("/order/success");
}
