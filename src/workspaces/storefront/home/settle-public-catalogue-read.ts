export type PublicCatalogueReadResult<T> =
  { ok: true; value: T } | { ok: false };

/** Keep one optional public merchandising read from rejecting its siblings. */
export async function settlePublicCatalogueRead<T>(
  read: Promise<T>,
): Promise<PublicCatalogueReadResult<T>> {
  try {
    return { ok: true, value: await read };
  } catch {
    return { ok: false };
  }
}
