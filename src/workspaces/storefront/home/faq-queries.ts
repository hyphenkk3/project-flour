import { createPublicClient } from "@/lib/supabase/server";
import {
  sortFaqItems,
  type StorefrontFaqRecord,
} from "@/engines/storefront/faq";

export type StorefrontFaqLoad =
  | { items: StorefrontFaqRecord[]; error: null }
  | { items: []; error: string };

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  is_active: boolean;
};

function mapRow(row: FaqRow): StorefrontFaqRecord {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    displayOrder: row.display_order,
    isActive: row.is_active,
  };
}

export async function loadActiveStorefrontFaqItems(): Promise<StorefrontFaqLoad> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("storefront_faq_items")
    .select("id, question, answer, display_order, is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return {
      items: [],
      error: "Customer Q&A is temporarily unavailable. Please try again shortly.",
    };
  }

  return {
    items: sortFaqItems((data ?? []).map(mapRow)),
    error: null,
  };
}
