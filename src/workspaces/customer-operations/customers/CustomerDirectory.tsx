"use client";

import { useMemo, useState } from "react";
import type { Customer } from "@/types/customer";
import { EmptyState } from "@/components/shell/EmptyState";
import { CustomerCard } from "@/workspaces/customer-operations/customers/CustomerCard";
import { matchesCustomerQuery } from "@/workspaces/customer-operations/customers/ui-shared";

type CustomerDirectoryProps = {
  customers: Customer[];
};

export function CustomerDirectory({ customers }: CustomerDirectoryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => customers.filter((customer) => matchesCustomerQuery(customer, query)),
    [customers, query],
  );

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="sr-only" htmlFor="customer-search">
          Search customers
        </label>
        <input
          autoComplete="off"
          className="border-fog text-ink focus:border-signal w-full rounded-lg border bg-white py-3 pr-20 pl-4 text-base outline-none"
          enterKeyHint="search"
          id="customer-search"
          inputMode="search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, WhatsApp, email"
          type="search"
          value={query}
        />
        {hasQuery ? (
          <button
            className="text-skyline hover:text-ink absolute top-1/2 right-2 min-h-10 min-w-14 -translate-y-1/2 rounded-md px-2 text-sm font-medium"
            onClick={() => setQuery("")}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          description={
            hasQuery
              ? "Try a different name, phone, last four digits, WhatsApp username, or email."
              : "Add a customer to start Customer Operations."
          }
          title={
            hasQuery ? "No customers match your search." : "No customers yet."
          }
        />
      ) : (
        <ul className="grid gap-3">
          {filtered.map((customer) => (
            <li key={customer.id}>
              <CustomerCard customer={customer} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
