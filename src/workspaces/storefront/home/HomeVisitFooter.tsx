import type { ReactNode } from "react";
import { storefrontKickerClass } from "@/workspaces/storefront/StorefrontBrand";
import { WhatsAppMark } from "@/workspaces/storefront/home/HomeMarks";
import {
  STOREFRONT_ADDRESS_LINES,
  STOREFRONT_LOCATION_LANDMARK,
  STOREFRONT_LOCATION_NAME,
  storefrontMapsHref,
  storefrontWhatsAppHref,
} from "@/workspaces/storefront/home/storefront-contact";

const linkClass =
  "text-ink hover:text-skyline inline-flex max-w-full items-center gap-2 text-sm font-medium transition-colors duration-200";

type HomeVisitFooterProps = {
  lead?: ReactNode;
};

export function HomeVisitFooter({ lead }: HomeVisitFooterProps) {
  const whatsappHref = storefrontWhatsAppHref();
  const mapsHref = storefrontMapsHref();
  const addressLines = STOREFRONT_ADDRESS_LINES.filter((line) => line.trim());

  return (
    <section className="px-6 pb-2 sm:px-10">
      <div className="border-fog/70 mx-auto grid w-full max-w-6xl items-start gap-8 border-t pt-3 md:grid-cols-2 md:gap-x-16 md:gap-y-8 md:pt-4 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.27fr)_minmax(0,0.18fr)] lg:gap-x-8 lg:gap-y-0 lg:pt-5">
        {lead ? (
          <div className="min-w-0 md:col-span-2 lg:col-span-1">{lead}</div>
        ) : null}

        {addressLines.length > 0 || mapsHref ? (
          <div className="min-w-0">
            <p className={storefrontKickerClass}>Find Us</p>
            <p className="font-display text-ink mt-2 text-lg tracking-tight">
              {STOREFRONT_LOCATION_NAME}
            </p>
            <p className="text-skyline mt-0.5 text-sm leading-relaxed">
              {STOREFRONT_LOCATION_LANDMARK}
            </p>
            {addressLines.map((line, index) => (
              <p
                className={`text-skyline text-sm leading-relaxed ${index === 0 ? "mt-2" : "mt-1"}`}
                key={line}
              >
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

        {whatsappHref ? (
          <div className="min-w-0">
            <p className={storefrontKickerClass}>WhatsApp Us</p>
            <a
              className={`${linkClass} mt-2 flex-wrap`}
              href={whatsappHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <WhatsAppMark className="h-3.5 w-3.5 shrink-0" />
              Chat with us on WhatsApp
              <span aria-hidden="true">→</span>
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
