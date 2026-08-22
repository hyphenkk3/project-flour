"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormInput } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LibraryVoucher } from "@/types/library-voucher";
import {
  libraryStatusTone,
  voucherStatusLabel,
  voucherTypeLabel,
} from "@/workspaces/library/labels";

type VoucherDirectoryProps = {
  vouchers: LibraryVoucher[];
  canManage: boolean;
};

export function VoucherDirectory({ vouchers, canManage }: VoucherDirectoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return vouchers;
    return vouchers.filter((item) => item.code.toLowerCase().includes(trimmed));
  }, [vouchers, query]);

  return (
    <div className="space-y-4">
      <FormInput
        aria-label="Search vouchers"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by code"
        value={query}
      />

      {filtered.length === 0 ? (
        <EmptyState
          description="Create reusable voucher codes for future catalogues."
          title="No vouchers yet"
        />
      ) : (
        <ul className="divide-fog border-fog divide-y rounded-xl border bg-white">
          {filtered.map((voucher) => (
            <li
              className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              key={voucher.id}
            >
              <div>
                <p className="text-ink font-medium tracking-wide">
                  {voucher.code}
                </p>
                <p className="text-skyline mt-1 text-sm">
                  {voucherTypeLabel(voucher.voucherType)} · {voucher.value}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={voucherStatusLabel(voucher.status)}
                  tone={libraryStatusTone(voucher.status)}
                />
                <Link
                  className="text-signal hover:text-ink text-sm font-medium"
                  href={`/library/vouchers/${voucher.id}`}
                >
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
