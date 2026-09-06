import {
  StorefrontHomeLink,
  StorefrontStaffSignIn,
  storefrontKickerClass,
} from "@/workspaces/storefront/StorefrontBrand";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";
import { STOREFRONT_FAQ_ITEMS } from "@/workspaces/storefront/home/storefront-contact";

export function StorefrontFaqPage() {
  return (
    <main className="bg-paper min-h-dvh">
      <StorefrontTheme />
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10">
        <StorefrontHomeLink />
        <p className={`${storefrontKickerClass} mt-8`}>Whitebird</p>
        <h1 className="font-display text-ink mt-2 text-3xl tracking-tight sm:text-4xl">
          FAQ
        </h1>
        <p className="text-skyline mt-3 max-w-xl text-[0.95rem] leading-relaxed">
          A few notes on ordering with Whitebird.
        </p>

        <dl className="mt-10 space-y-8">
          {STOREFRONT_FAQ_ITEMS.map((item) => (
            <div className="border-fog/70 border-t pt-5" key={item.question}>
              <dt className="font-display text-ink text-xl tracking-tight">
                {item.question}
              </dt>
              <dd className="text-skyline mt-2 max-w-xl text-sm leading-relaxed">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>

        <StorefrontStaffSignIn />
      </div>
    </main>
  );
}
