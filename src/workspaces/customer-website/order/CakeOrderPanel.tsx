"use client";

import Link from "next/link";
import { useState } from "react";
import { CakeSizeChooser } from "@/workspaces/customer-website/browse/CakeSizeChooser";
import type {
  CakeDetail,
  CakeSizeOption,
} from "@/workspaces/customer-website/browse/cake-detail-demo";

type CakeOrderPanelProps = {
  cake: CakeDetail;
  journeyActive?: boolean;
};

export function CakeOrderPanel({
  cake,
  journeyActive = false,
}: CakeOrderPanelProps) {
  const [selectedSizeId, setSelectedSizeId] = useState(cake.sizes[0]?.id ?? "");
  const selectedSize: CakeSizeOption | undefined =
    cake.sizes.find((size) => size.id === selectedSizeId) ?? cake.sizes[0];

  const href = selectedSize
    ? `/order?cake=${encodeURIComponent(cake.id)}&size=${encodeURIComponent(selectedSize.id)}${journeyActive ? "&step=website" : ""}`
    : "/browse";

  return (
    <div className="space-y-10">
      <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
        <CakeSizeChooser
          onSelect={setSelectedSizeId}
          selectedId={selectedSizeId}
          sizes={cake.sizes}
        />
      </section>

      <div className="space-y-3">
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-medium transition sm:w-auto sm:min-w-[18rem]"
          href={href}
        >
          🍰 Start This Celebration
        </Link>
        <p className="text-skyline max-w-md text-sm leading-relaxed">
          When you&apos;re ready, we&apos;ll guide you through ordering — no
          payment on this page.
        </p>
      </div>
    </div>
  );
}
