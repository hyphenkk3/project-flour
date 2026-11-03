/**
 * Coordinates the optional, secondary checkout catalogue read. The required
 * cart/date confirmation remains a separate action and is never retried here.
 *
 * @template T
 * @param {{
 *   pickupDate: string,
 *   requestKey?: string,
 *   load: (pickupDate: string) => Promise<T>,
 *   isCurrent: (pickupDate: string) => boolean,
 *   onState: (state: { pickupDate: string, requestKey: string, status: 'loading' | 'error' | 'ready' }) => void,
 *   onSuccess: (result: T, pickupDate: string) => void,
 * }} options
 */
export function createSecondaryOfferLoader(options) {
  let cancelled = false;
  let completed = false;
  const requestKey = options.requestKey ?? options.pickupDate;
  /** @type {Promise<void> | null} */
  let pending = null;

  return {
    /** Retry is user-triggered after an error; simultaneous calls share one read. */
    run() {
      if (cancelled || completed || !options.isCurrent(options.pickupDate)) {
        return Promise.resolve();
      }
      if (pending) return pending;

      options.onState({
        pickupDate: options.pickupDate,
        requestKey,
        status: "loading",
      });
      const request = Promise.resolve()
        .then(() => options.load(options.pickupDate))
        .then(
          (result) => {
            if (cancelled || !options.isCurrent(options.pickupDate)) return;
            completed = true;
            options.onSuccess(result, options.pickupDate);
            options.onState({
              pickupDate: options.pickupDate,
              requestKey,
              status: "ready",
            });
          },
          () => {
            if (cancelled || !options.isCurrent(options.pickupDate)) return;
            options.onState({
              pickupDate: options.pickupDate,
              requestKey,
              status: "error",
            });
          },
        )
        .finally(() => {
          if (pending === request) pending = null;
        });
      pending = request;
      return request;
    },
    cancel() {
      cancelled = true;
    },
  };
}
