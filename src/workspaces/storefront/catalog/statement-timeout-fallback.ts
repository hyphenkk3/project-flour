/** One alternate read only after PostgreSQL cancels the embedded display query. */
export async function readWithStatementTimeoutFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/canceling statement due to statement timeout/i.test(message)) {
      throw error;
    }
    return fallback();
  }
}

/** Reattach the independently read tags without changing cake or tag order. */
export function attachCakeTagAssignments<
  T extends { id: string },
  A extends { cake_id: string },
>(
  cakes: readonly T[],
  assignments: readonly A[],
): Array<T & { library_cake_tag_assignments: A[] }> {
  const byCake = new Map<string, A[]>();
  for (const assignment of assignments) {
    const rows = byCake.get(assignment.cake_id) ?? [];
    rows.push(assignment);
    byCake.set(assignment.cake_id, rows);
  }
  return cakes.map((cake) => ({
    ...cake,
    library_cake_tag_assignments: byCake.get(cake.id) ?? [],
  }));
}
