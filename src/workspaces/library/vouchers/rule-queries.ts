import {
  emptyCatalogueRules,
  parseCatalogueOrderType,
} from "@/engines/vouchers/catalogue-voucher";
import type {
  CatalogueVoucherRuleType,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

type RuleRow = {
  id: string;
  voucher_id: string;
  rule_type: CatalogueVoucherRuleType;
  date_from: string | null;
  date_until: string | null;
  amount: number | string | null;
};

type RuleValueRow = {
  rule_id: string;
  cake_id: string | null;
  cake_size_id: string | null;
  size_label: string | null;
  value_code: string | null;
  library_cakes?: { name: string } | { name: string }[] | null;
};

function cakeNameFromEmbed(value: RuleValueRow["library_cakes"]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value.name ?? null;
}

export function mapRuleRowsToCatalogueRules(
  rules: RuleRow[],
  values: RuleValueRow[],
): CatalogueVoucherRules {
  const next = emptyCatalogueRules();
  const valuesByRule = new Map<string, RuleValueRow[]>();
  for (const value of values) {
    const list = valuesByRule.get(value.rule_id) ?? [];
    list.push(value);
    valuesByRule.set(value.rule_id, list);
  }

  for (const rule of rules) {
    const ruleValues = valuesByRule.get(rule.id) ?? [];
    if (rule.rule_type === "order_date") {
      next.orderDate = {
        from: rule.date_from,
        until: rule.date_until,
      };
    } else if (rule.rule_type === "fulfilment_date") {
      next.fulfilmentDate = {
        from: rule.date_from,
        until: rule.date_until,
      };
    } else if (rule.rule_type === "minimum_cake_subtotal") {
      next.minimumCakeSubtotal =
        rule.amount == null ? null : Number(rule.amount);
    } else if (rule.rule_type === "cake") {
      next.cakeIds = ruleValues
        .map((row) => row.cake_id)
        .filter((id): id is string => Boolean(id));
      next.cakeNames = ruleValues
        .map((row) => cakeNameFromEmbed(row.library_cakes))
        .filter((name): name is string => Boolean(name));
    } else if (rule.rule_type === "cake_size") {
      next.sizeLabels = ruleValues
        .map((row) => row.size_label)
        .filter((label): label is string => Boolean(label));
    } else if (rule.rule_type === "order_type") {
      next.orderTypes = ruleValues
        .map((row) => parseCatalogueOrderType(row.value_code))
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
    }
  }

  return next;
}

export async function loadCatalogueRulesForVouchers(
  supabase: StaffClient,
  voucherIds: string[],
): Promise<Map<string, CatalogueVoucherRules>> {
  const mapped = new Map<string, CatalogueVoucherRules>();
  if (voucherIds.length === 0) return mapped;

  const { data: ruleRows, error: ruleError } = await supabase
    .from("library_voucher_rules")
    .select("id, voucher_id, rule_type, date_from, date_until, amount")
    .in("voucher_id", voucherIds);
  if (ruleError) {
    throw new Error(ruleError.message);
  }

  const rules = (ruleRows ?? []) as RuleRow[];
  const ruleIds = rules.map((row) => row.id);
  let values: RuleValueRow[] = [];
  if (ruleIds.length > 0) {
    const { data: valueRows, error: valueError } = await supabase
      .from("library_voucher_rule_values")
      .select(
        "rule_id, cake_id, cake_size_id, size_label, value_code, library_cakes(name)",
      )
      .in("rule_id", ruleIds);
    if (valueError) {
      throw new Error(valueError.message);
    }
    values = (valueRows ?? []) as RuleValueRow[];
  }

  const rulesByVoucher = new Map<string, RuleRow[]>();
  for (const rule of rules) {
    const list = rulesByVoucher.get(rule.voucher_id) ?? [];
    list.push(rule);
    rulesByVoucher.set(rule.voucher_id, list);
  }

  for (const voucherId of voucherIds) {
    const voucherRules = rulesByVoucher.get(voucherId) ?? [];
    const voucherRuleIds = new Set(voucherRules.map((row) => row.id));
    mapped.set(
      voucherId,
      mapRuleRowsToCatalogueRules(
        voucherRules,
        values.filter((row) => voucherRuleIds.has(row.rule_id)),
      ),
    );
  }
  return mapped;
}

export async function replaceLibraryVoucherRules(
  supabase: StaffClient,
  voucherId: string,
  rules: CatalogueVoucherRules,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("library_voucher_rules")
    .delete()
    .eq("voucher_id", voucherId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  async function insertRule(
    ruleType: CatalogueVoucherRuleType,
    payload: {
      date_from?: string | null;
      date_until?: string | null;
      amount?: number | null;
    },
    values: Array<{
      cake_id?: string | null;
      cake_size_id?: string | null;
      size_label?: string | null;
      value_code?: string | null;
    }>,
  ) {
    const { data, error } = await supabase
      .from("library_voucher_rules")
      .insert({
        voucher_id: voucherId,
        rule_type: ruleType,
        date_from: payload.date_from ?? null,
        date_until: payload.date_until ?? null,
        amount: payload.amount ?? null,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    if (values.length === 0) return;
    const { error: valueError } = await supabase
      .from("library_voucher_rule_values")
      .insert(
        values.map((value) => ({
          rule_id: data.id,
          cake_id: value.cake_id ?? null,
          cake_size_id: value.cake_size_id ?? null,
          size_label: value.size_label ?? null,
          value_code: value.value_code ?? null,
        })),
      );
    if (valueError) {
      throw new Error(valueError.message);
    }
  }

  if (rules.orderDate) {
    await insertRule("order_date", {
      date_from: rules.orderDate.from,
      date_until: rules.orderDate.until,
    }, []);
  }
  if (rules.fulfilmentDate) {
    await insertRule("fulfilment_date", {
      date_from: rules.fulfilmentDate.from,
      date_until: rules.fulfilmentDate.until,
    }, []);
  }
  if (rules.minimumCakeSubtotal != null) {
    await insertRule(
      "minimum_cake_subtotal",
      { amount: rules.minimumCakeSubtotal },
      [],
    );
  }
  if (rules.sizeLabels.length > 0) {
    await insertRule(
      "cake_size",
      {},
      rules.sizeLabels.map((size_label) => ({ size_label })),
    );
  }
  if (rules.cakeIds.length > 0) {
    await insertRule(
      "cake",
      {},
      rules.cakeIds.map((cake_id) => ({ cake_id })),
    );
  }
  if (rules.orderTypes.length > 0) {
    await insertRule(
      "order_type",
      {},
      rules.orderTypes.map((value_code) => ({ value_code })),
    );
  }
}
