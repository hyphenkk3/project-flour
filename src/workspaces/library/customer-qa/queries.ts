import { sortFaqItems, type StorefrontFaqRecord } from "@/engines/storefront/faq";
import { createClient } from "@/lib/supabase/server";

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

export async function listStorefrontFaqItems(): Promise<StorefrontFaqRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("storefront_faq_items")
    .select("id, question, answer, display_order, is_active")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return sortFaqItems((data ?? []).map(mapRow));
}
