"use client";

import { useEffect, useState } from "react";
import {
  PREORDER_DRAFT_CHANGED_EVENT,
  readPreorderDraft,
  type PreorderDraft,
} from "@/workspaces/storefront/checkout/preorder-draft";

export function usePreorderDraft(): PreorderDraft | null {
  const [draft, setDraft] = useState<PreorderDraft | null>(null);

  useEffect(() => {
    function refresh() {
      setDraft(readPreorderDraft());
    }
    refresh();
    window.addEventListener(PREORDER_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(PREORDER_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return draft;
}
