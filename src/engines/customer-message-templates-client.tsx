"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS,
  validateCustomerMessageTemplateBody,
  type CustomerMessageTemplateKey,
  type CustomerMessageTemplateRows,
} from "@/engines/customer-message-templates";

type TemplateRow = { template_key: string; body: string };
let cached: CustomerMessageTemplateRows = {};
let loadedAt = 0;
let pending: Promise<{ rows: CustomerMessageTemplateRows; fallback: boolean }> | null = null;
const CACHE_MS = 30_000;

async function loadTemplates(force = false) {
  if (force) loadedAt = 0;
  if (Date.now() - loadedAt < CACHE_MS) return { rows: cached, fallback: false };
  if (!pending) {
    pending = (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("customer_message_templates").select("template_key,body");
        if (error) throw error;
        const next: CustomerMessageTemplateRows = {};
        for (const row of (data ?? []) as TemplateRow[]) {
          next[row.template_key as CustomerMessageTemplateKey] = row.body;
        }
        const incomplete = CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.some((definition) => {
          const body = next[definition.key];
          return !body || !validateCustomerMessageTemplateBody(definition.key, body).valid;
        });
        cached = next;
        loadedAt = Date.now();
        return { rows: next, fallback: incomplete };
      } catch {
        return { rows: {}, fallback: true };
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}

export function invalidateCustomerMessageTemplates() {
  loadedAt = 0;
  cached = {};
  pending = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("customer-message-templates-invalidated"));
  }
}

export function useCustomerMessageTemplates() {
  const [state, setState] = useState<{ templates: CustomerMessageTemplateRows; usingFallback: boolean }>({
    templates: cached,
    usingFallback: Object.keys(cached).length === 0,
  });
  useEffect(() => {
    let live = true;
    const refresh = (force = false) => {
      void loadTemplates(force).then((result) => {
        if (live) setState({ templates: result.rows, usingFallback: result.fallback });
      });
    };
    const onInvalidate = () => refresh(true);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("customer-message-templates-invalidated", onInvalidate);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => refresh(), CACHE_MS);
    return () => {
      live = false;
      window.removeEventListener("customer-message-templates-invalidated", onInvalidate);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

export function CustomerMessageTemplateNotice({ usingFallback }: { usingFallback: boolean }) {
  if (!usingFallback) return null;
  return (
    <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Saved message wording is unavailable or incomplete. Whitebird’s original message is being used.
    </p>
  );
}
