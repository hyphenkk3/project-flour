import { useCallback, useEffect, useRef } from "react";
import { createCoalescedReconciliation } from "@/lib/coalescedReconciliation";

/**
 * Runs at most one authoritative refresh at a time. Signals received while a
 * refresh is pending are coalesced into one follow-up; a response superseded
 * by a newer signal is discarded before it can update UI state.
 */
export function useCoalescedReconciliation<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
): () => Promise<void> {
  const loadRef = useRef(load);
  const applyRef = useRef(apply);
  const activeRef = useRef(true);
  const reconcileRef = useRef<(() => Promise<void>) | null>(null);

  loadRef.current = load;
  applyRef.current = apply;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  if (!reconcileRef.current) {
    reconcileRef.current = createCoalescedReconciliation(
      () => loadRef.current(),
      (value) => {
        if (activeRef.current) applyRef.current(value);
      },
    );
  }

  return useCallback(() => reconcileRef.current!(), []);
}
