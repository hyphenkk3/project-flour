"use client";

import { useEffect } from "react";
import { clearPreorderDraft } from "@/workspaces/storefront/checkout/preorder-draft";

export function ClearPreorderDraftOnSuccess() {
  useEffect(() => {
    clearPreorderDraft();
  }, []);
  return null;
}
