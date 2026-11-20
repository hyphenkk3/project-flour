"use client";

import { useEffect, useState } from "react";
import { FormField, FormInput, FormSelect } from "@/components/ui/form";
import {
  JOTFORM_NEW_ORDER_CUTOFF_MS,
  isJotformAvailableForNewStaffOrder,
} from "@/engines/orders/staff-order-source";
import type { StaffGuestOrderSource } from "@/workspaces/owner/orders/labels";
import {
  defaultStaffGuestNewOrderSource,
  staffGuestNewOrderSources,
} from "@/workspaces/owner/orders/labels";

export function StaffGuestOrderSourceFields() {
  // Keep server and first client render consistent at the boundary. The mounted
  // client immediately applies the real creation time below.
  const [now, setNow] = useState(JOTFORM_NEW_ORDER_CUTOFF_MS);
  const [source, setSource] = useState<StaffGuestOrderSource>(() =>
    defaultStaffGuestNewOrderSource(),
  );
  const jotformAvailable = isJotformAvailableForNewStaffOrder(now);
  const sources = staffGuestNewOrderSources(now);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (now >= JOTFORM_NEW_ORDER_CUTOFF_MS) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      JOTFORM_NEW_ORDER_CUTOFF_MS - now + 1,
    );
    return () => window.clearTimeout(timer);
  }, [now]);

  useEffect(() => {
    if (!jotformAvailable && source === "jotform") setSource("whatsapp");
  }, [jotformAvailable, source]);

  return (
    <>
      <FormField htmlFor="order_source" label="Order source">
        <FormSelect
          id="order_source"
          name="order_source"
          onChange={(event) => setSource(event.target.value as StaffGuestOrderSource)}
          required
          value={source}
        >
          {sources.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormSelect>
      </FormField>
      {source === "other" ? (
        <FormField
          htmlFor="order_source_other"
          label="Specify order source"
        >
          <FormInput
            autoComplete="off"
            id="order_source_other"
            name="order_source_other"
            required
          />
        </FormField>
      ) : null}
    </>
  );
}
