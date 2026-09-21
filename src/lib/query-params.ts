/**
 * Next.js searchParams values are `string | string[] | undefined`.
 * Calling `.trim()` on an array throws during some client navigations.
 */
export function firstQueryParam(
  value: string | string[] | null | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function firstQueryDateParam(
  value: string | string[] | null | undefined,
): string {
  const key = firstQueryParam(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
}
