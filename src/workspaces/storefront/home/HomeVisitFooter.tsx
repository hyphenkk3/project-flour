import Link from "next/link";
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";
import { WhatsAppMark } from "@/workspaces/storefront/home/HomeMarks";
import {
  STOREFRONT_ADDRESS_LINES,
  STOREFRONT_LOCATION_NAME,
  storefrontMapsHref,
  storefrontWhatsAppHref,
} from "@/workspaces/storefront/home/storefront-contact";

const linkClass =
  "text-ink hover:text-skyline inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200";

export function HomeVisitFooter() {
  const whatsappHref = storefrontWhatsAppHref();
  const mapsHref = storefrontMapsHref();
  const addressLines = STOREFRONT_ADDRESS_LINES.filter((line) => line.trim());

  return (
    <section className="px-6 pb-2 sm:px-10">
      <div className="border-fog/70 mx-auto grid w-full max-w-6xl gap-6 border-t pt-5 md:grid-cols-3 md:gap-8">
        <div>
          <p className={storefrontKickerClass}>FAQ</p>
          <Link className={`${linkClass} mt-2`} href="/faq">
            Common questions
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {whatsappHref ? (
          <div>
            <p className={storefrontKickerClass}>WhatsApp Us</p>
            <a
              className={`${linkClass} mt-2`}
              href={whatsappHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <WhatsAppMark className="h-3.5 w-3.5" />
              Chat with us on WhatsApp
              <span aria-hidden="true">→</span>
            </a>
          </div>
        ) : null}

        {addressLines.length > 0 || mapsHref ? (
          <div>
            <p className={storefrontKickerClass}>Find Us</p>
            <p className="font-display text-ink mt-2 text-lg tracking-tight">
              {STOREFRONT_LOCATION_NAME}
            </p>
            {addressLines.map((line) => (
              <p className="text-skyline mt-1 text-sm leading-relaxed" key={line}>
                {line}
              </p>
            ))}
            {mapsHref ? (
              <a
                className={`${linkClass} mt-2`}
                href={mapsHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                Get Directions
                <span aria-hidden="true">→</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
