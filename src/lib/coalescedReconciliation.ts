/**
 * Serializes authoritative refreshes. Bursts during a read produce one follow-up,
 * and superseded responses are discarded before they reach the UI.
 */
export function createCoalescedReconciliation<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
): () => Promise<void> {
  let revision = 0;
  let inFlight: Promise<void> | null = null;

  return () => {
    revision += 1;
    if (inFlight) return inFlight;

    const reconcile = async () => {
      while (true) {
        const requestedRevision = revision;
        try {
          const value = await load();
          if (requestedRevision !== revision) continue;
          apply(value);
        } catch {
          // A later Realtime, activity, or polling signal retries the read.
          if (requestedRevision !== revision) continue;
          break;
        }

        if (requestedRevision === revision) break;
      }
    };

    const request = reconcile().finally(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return request;
  };
}
